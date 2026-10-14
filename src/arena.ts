import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ArenaError, dimensions, type Actor, type ArenaService, type BootstrapResult } from './contracts.js';

type Data = Record<string, any>;
type Stored = Data & { id: string; workspace_id: string };

/** Durable domain boundary shared by authenticated transports. */
export class Arena implements ArenaService {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS actors (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS members (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        actor_id TEXT NOT NULL REFERENCES actors(id), role TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(workspace_id, actor_id)
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        type TEXT NOT NULL, data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_workspace_type ON records(workspace_id, type);
      CREATE TABLE IF NOT EXISTS operations (
        workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, key TEXT NOT NULL,
        fingerprint TEXT NOT NULL, result TEXT NOT NULL,
        PRIMARY KEY(workspace_id, actor_id, key)
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        operation TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL
      );
    `);
  }

  bootstrap(input: { workspace_name: string; owner_name: string }): BootstrapResult {
    this.requireText(input.workspace_name, 'workspace_name');
    this.requireText(input.owner_name, 'owner_name');
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM workspaces LIMIT 1').get()) {
        throw new ArenaError('ACCESS_DENIED', 'A Arena já foi inicializada. Use suas credenciais existentes.');
      }
      const workspace_id = randomUUID();
      this.db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run(workspace_id, input.workspace_name);
      const makeActor = (kind: Actor['kind'], name: string, role: string) => {
        const actor: Actor = { id: randomUUID(), kind };
        const token = randomBytes(32).toString('base64url');
        this.db.prepare('INSERT INTO actors (id, kind, name, token_hash) VALUES (?, ?, ?, ?)')
          .run(actor.id, kind, name, this.hash(token));
        this.db.prepare('INSERT INTO members (workspace_id, actor_id, role) VALUES (?, ?, ?)')
          .run(workspace_id, actor.id, role);
        return { actor, token };
      };
      const owner = makeActor('human', input.owner_name, 'owner');
      const agent = makeActor('agent', 'Agente de exemplo', 'editor');
      return { workspace_id, owner: owner.actor, owner_token: owner.token, agent: agent.actor, agent_token: agent.token };
    });
  }

  authenticate(token: string): Actor {
    if (typeof token !== 'string' || !token) throw new ArenaError('ACCESS_DENIED', 'Credencial inválida.');
    const row = this.db.prepare('SELECT id, kind FROM actors WHERE token_hash = ? AND active = 1').get(this.hash(token));
    if (!row) throw new ArenaError('ACCESS_DENIED', 'Credencial inválida ou revogada.');
    return { id: String(row.id), kind: row.kind as Actor['kind'] };
  }

  execute(operation: string, actor: Actor, input: Data): any {
    if (!input || typeof input !== 'object' || Array.isArray(input)) this.invalid('Argumentos devem ser um objeto.');
    const workspace = this.requireText(input.workspace_id, 'workspace_id');
    const persisted = this.authorize(actor, workspace);
    if (operation.startsWith('human.') && persisted.kind !== 'human') {
      throw new ArenaError('ACCESS_DENIED', 'Esta ação exige uma pessoa autenticada.');
    }
    switch (operation) {
      case 'arena.list_work': return this.listWork(workspace, input);
      case 'arena.read_context': return this.readContext(workspace, input);
      case 'arena.get_operation': {
        const row = this.db.prepare('SELECT result FROM operations WHERE workspace_id = ? AND actor_id = ? AND key = ?')
          .get(workspace, persisted.id, this.requireText(input.idempotency_key, 'idempotency_key'));
        return row ? { found: true, result: JSON.parse(String(row.result)) } : { found: false };
      }
      case 'arena.create_exploration':
        return this.mutate(operation, persisted, workspace, input, () => this.createExploration(workspace, persisted, input));
      case 'arena.submit_proposal':
        return this.mutate(operation, persisted, workspace, input, () => this.submitProposal(workspace, persisted, input));
      case 'arena.add_feedback':
        return this.mutate(operation, persisted, workspace, input, () => this.addFeedback(workspace, persisted, input));
      case 'human.decide_proposal':
        return this.mutate(operation, persisted, workspace, input, () => this.decideProposal(workspace, persisted, input));
      default: throw new ArenaError('INVALID_INPUT', 'Operação desconhecida ou ainda indisponível.');
    }
  }

  close(): void { this.db.close(); }

  private authorize(actor: Actor, workspace: string): Actor {
    const member = this.db.prepare(`SELECT actors.id, actors.kind FROM actors JOIN members ON actors.id = members.actor_id
      WHERE actors.id = ? AND actors.active = 1 AND members.active = 1 AND members.workspace_id = ?`).get(actor?.id ?? '', workspace);
    if (!member) throw new ArenaError('NOT_FOUND', 'Workspace ou recurso não encontrado.');
    return { id: String(member.id), kind: member.kind as Actor['kind'] };
  }

  private createExploration(workspace: string, actor: Actor, input: Data): Data {
    const title = this.requireText(input.title, 'title');
    const objective = this.requireText(input.objective, 'objective');
    if (input.profile_revision_id != null) this.invalid('Perfil ainda indisponível.');
    const exploration_id = randomUUID();
    const branch_id = randomUUID();
    const revision_id = randomUUID();
    this.insert('exploration', { id: exploration_id, workspace_id: workspace, title, objective, author: actor, created_at: this.now() });
    this.insert('branch', { id: branch_id, workspace_id: workspace, exploration_id, name: 'Principal',
      origin_branch_id: null, origin_revision_id: null, current_revision_id: revision_id, profile_revision_id: null });
    this.insert('revision', { id: revision_id, workspace_id: workspace, branch_id, parent_revision_id: null,
      fields: Object.fromEntries(dimensions.map(dimension => [dimension, ''])), locks: {}, artifacts: {},
      profile_revision_id: null, author: actor, created_at: this.now() });
    return { exploration_id, branch_id, revision_id };
  }

  private listWork(workspace: string, input: Data): Data {
    const branches = this.list('branch', workspace);
    const query = typeof input.query === 'string' ? input.query.toLocaleLowerCase() : '';
    const explorations = this.list('exploration', workspace).filter(exploration =>
      !query || `${exploration.title} ${exploration.objective}`.toLocaleLowerCase().includes(query)
    ).map(exploration => ({ id: exploration.id, title: exploration.title, objective: exploration.objective,
      branches: branches.filter(branch => branch.exploration_id === exploration.id).map(branch => ({
        id: branch.id, name: branch.name, current_revision_id: branch.current_revision_id,
        profile_revision_id: branch.profile_revision_id
      })) }));
    return { explorations, next_cursor: null };
  }

  private readContext(workspace: string, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    const exploration = this.get('exploration', workspace, branch.exploration_id);
    const revision = this.get('revision', workspace, input.revision_id ?? branch.current_revision_id);
    if (revision.branch_id !== branch.id) this.notFound();
    const proposals = this.list('proposal', workspace).filter(proposal => proposal.branch_id === branch.id);
    const decisions = this.list('decision', workspace).filter(decision => decision.branch_id === branch.id);
    const feedback = this.list('feedback', workspace).filter(item => item.branch_id === branch.id);
    return { format_version: 1, workspace_id: workspace,
      exploration: { id: exploration.id, title: exploration.title, objective: exploration.objective },
      branch: { id: branch.id, name: branch.name, origin_branch_id: branch.origin_branch_id,
        origin_revision_id: branch.origin_revision_id, current_revision_id: branch.current_revision_id,
        profile_revision_id: branch.profile_revision_id },
      revision: { id: revision.id, fields: revision.fields, locks: revision.locks, artifacts: revision.artifacts,
        profile_revision_id: revision.profile_revision_id },
      profile: null, proposals, decisions, feedback, sources: [],
      open_questions: feedback.filter(item => item.type === 'question').map(item => ({ id: item.id, text: item.text })),
      next_action: proposals.some(proposal => proposal.status === 'pending')
        ? 'Revise as propostas pendentes e solicite uma decisão humana.' : 'Proponha um próximo passo para esta exploração.',
      next_cursor: null };
  }

  private submitProposal(workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const base = this.get('revision', workspace, input.base_revision_id);
    if (base.branch_id !== branch.id) this.notFound();
    if (base.id !== branch.current_revision_id) this.conflict(branch, base.id);
    const changes = this.validateChanges(input.changes);
    const dependencies = this.validateDependencies(input.dependencies, changes);
    const source_ids = this.validateSourceIds(workspace, input.source_ids);
    const rationale = this.requireText(input.rationale, 'rationale');
    if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.some((warning: unknown) => typeof warning !== 'string'))) {
      this.invalid('warnings deve ser uma lista de textos.');
    }
    const proposal: Stored = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
      base_revision_id: base.id, version: 1, status: 'pending', changes, dependencies, rationale, source_ids,
      warnings: input.warnings ?? [], author: actor, created_at: this.now(), origin_proposal_id: null };
    this.insert('proposal', proposal);
    return { proposal_id: proposal.id, version: proposal.version, status: proposal.status };
  }

  private addFeedback(workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const revision = this.get('revision', workspace, input.revision_id);
    if (revision.branch_id !== branch.id) this.notFound();
    if (input.target_id !== branch.id) {
      const proposal = this.get('proposal', workspace, input.target_id);
      if (proposal.branch_id !== branch.id) this.notFound();
    }
    if (!['critique', 'question', 'comment'].includes(input.type)) this.invalid('Tipo de comentário inválido.');
    const feedback: Stored = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
      target_id: input.target_id, revision_id: revision.id, text: this.requireText(input.text, 'text'),
      type: input.type, author: actor, created_at: this.now() };
    this.insert('feedback', feedback);
    return { feedback_id: feedback.id };
  }

  private decideProposal(workspace: string, actor: Actor, input: Data): Data {
    const proposal = this.get('proposal', workspace, input.proposal_id);
    const branch = this.get('branch', workspace, proposal.branch_id);
    this.expectHead(branch, input.expected_revision);
    this.expectHead(branch, input.expected_head_revision);
    if (input.presented_version !== proposal.version) {
      throw new ArenaError('REVISION_CONFLICT', 'A versão apresentada da proposta mudou.',
        { proposal_id: proposal.id, current_version: proposal.version }, false, 'Releia a proposta antes de decidir.');
    }
    if (!['accepted', 'rejected', 'deferred', 'superseded'].includes(input.decision)) this.invalid('Decisão inválida.');
    if (!['pending', 'deferred'].includes(proposal.status)) {
      throw new ArenaError('REVISION_CONFLICT', 'Esta proposta já recebeu uma decisão final.', { proposal_id: proposal.id });
    }
    if (input.comment !== undefined && typeof input.comment !== 'string') this.invalid('comment deve ser texto.');
    const selected: string[] = input.selected_dimensions ?? Object.keys(proposal.changes);
    if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length ||
      selected.some(dimension => typeof dimension !== 'string' || !Object.hasOwn(proposal.changes, dimension))) {
      this.invalid('Selecione dimensões presentes na proposta.');
    }
    if (input.selected_dimensions !== undefined && input.decision !== 'accepted') {
      this.invalid('Seleção parcial é permitida apenas no aceite.');
    }
    let acceptedProposal = proposal;
    const partial = input.decision === 'accepted' && selected.length < Object.keys(proposal.changes).length;
    if (partial) {
      acceptedProposal = { ...proposal, id: randomUUID(), origin_proposal_id: proposal.id,
        changes: Object.fromEntries(selected.map(dimension => [dimension, proposal.changes[dimension]])),
        dependencies: Object.fromEntries(selected.filter(dimension => Object.hasOwn(proposal.dependencies, dimension))
          .map(dimension => [dimension, proposal.dependencies[dimension]])), created_at: this.now() };
      this.insert('proposal', acceptedProposal);
    }
    let revision_id: string | undefined;
    if (input.decision === 'accepted') {
      if (proposal.base_revision_id !== branch.current_revision_id) this.conflict(branch, proposal.base_revision_id);
      const previous = this.get('revision', workspace, branch.current_revision_id);
      const revision: Stored = { ...previous, id: randomUUID(), parent_revision_id: previous.id,
        fields: { ...previous.fields, ...acceptedProposal.changes }, artifacts: { ...previous.artifacts },
        author: actor, created_at: this.now() };
      for (const [dimension, content] of Object.entries(acceptedProposal.changes)) {
        if (previous.locks[dimension] !== undefined && previous.locks[dimension] !== content) {
          throw new ArenaError('LOCK_VIOLATION', 'A proposta altera uma dimensão travada.', { dimension });
        }
        revision.artifacts[dimension] = { content, dependencies: acceptedProposal.dependencies[dimension] ?? null,
          source_ids: proposal.source_ids, needs_review: false, input_revision_id: previous.id, author: proposal.author };
      }
      this.insert('revision', revision);
      branch.current_revision_id = revision.id;
      this.update('branch', branch);
      revision_id = revision.id;
    }
    acceptedProposal.status = input.decision;
    this.update('proposal', acceptedProposal);
    const decision: Stored = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
      proposal_id: acceptedProposal.id, presented_proposal_id: proposal.id,
      presented_version: proposal.version, decision: input.decision,
      base_revision_id: proposal.base_revision_id, examined_revision_id: input.expected_head_revision,
      revision_id: revision_id ?? null, selected_dimensions: selected,
      comment: input.comment ?? '', author: actor, created_at: this.now() };
    this.insert('decision', decision);
    return { decision_id: decision.id, ...(revision_id ? { revision_id } : {}), proposal_id: proposal.id,
      ...(partial ? { derived_proposal_id: acceptedProposal.id } : {}) };
  }

  private validateChanges(value: unknown): Data {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
      return this.invalid('changes deve indicar ao menos uma dimensão.');
    }
    for (const [dimension, content] of Object.entries(value)) {
      if (!dimensions.includes(dimension as any) || typeof content !== 'string') this.invalid('Dimensão ou texto inválido.');
    }
    return { ...value };
  }
  private validateDependencies(value: unknown, changes: Data): Data {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return this.invalid('Dependências inválidas.');
    for (const [dimension, upstream] of Object.entries(value)) {
      if (!Object.hasOwn(changes, dimension) || !Array.isArray(upstream) ||
        upstream.some(item => !dimensions.includes(item) || item === dimension)) this.invalid('Dependências inválidas.');
    }
    return { ...value };
  }
  private validateSourceIds(workspace: string, value: unknown): string[] {
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string')) return this.invalid('source_ids deve ser uma lista de IDs.');
    for (const id of value) {
      const source = this.get('source', workspace, id);
      if (source.status !== 'active') throw new ArenaError('SOURCE_UNAVAILABLE', 'Fonte indisponível.', { source_id: id });
    }
    return [...new Set(value)];
  }
  private expectHead(branch: Stored, expected: unknown): void {
    this.requireText(expected, 'expected_revision');
    if (branch.current_revision_id !== expected) this.conflict(branch, expected);
  }
  private conflict(branch: Stored, base: unknown): never {
    throw new ArenaError('REVISION_CONFLICT', 'A ramificação avançou. Compare e reapresente a proposta.',
      { branch_id: branch.id, base_revision_id: base, current_revision_id: branch.current_revision_id },
      false, 'Releia a revisão atual antes de propor ou decidir.');
  }

  private mutate(operation: string, actor: Actor, workspace: string, input: Data, action: () => Data): Data {
    const key = this.requireText(input.idempotency_key, 'idempotency_key');
    const fingerprint = this.hash(this.canonical({ operation, input }));
    return this.transaction(() => {
      this.authorize(actor, workspace);
      const prior = this.db.prepare('SELECT fingerprint, result FROM operations WHERE workspace_id = ? AND actor_id = ? AND key = ?')
        .get(workspace, actor.id, key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ArenaError('IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros argumentos.');
        return JSON.parse(String(prior.result));
      }
      const result = action();
      this.db.prepare('INSERT INTO operations (workspace_id, actor_id, key, fingerprint, result) VALUES (?, ?, ?, ?, ?)')
        .run(workspace, actor.id, key, fingerprint, JSON.stringify(result));
      this.db.prepare('INSERT INTO audit_events (id, workspace_id, actor_id, operation, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), workspace, actor.id, operation, result.branch_id ?? result.exploration_id ?? null, this.now());
      return result;
    });
  }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = action(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private get(type: string, workspace: string, id: unknown): Stored {
    if (typeof id !== 'string') this.invalid('Identificador obrigatório.');
    const row = this.db.prepare('SELECT data FROM records WHERE id = ? AND workspace_id = ? AND type = ?').get(id, workspace, type);
    if (!row) return this.notFound();
    return JSON.parse(String(row.data));
  }
  private list(type: string, workspace: string): Stored[] {
    return this.db.prepare('SELECT data FROM records WHERE workspace_id = ? AND type = ? ORDER BY rowid').all(workspace, type)
      .map(row => JSON.parse(String(row.data)));
  }
  private insert(type: string, record: Stored): void {
    this.db.prepare('INSERT INTO records (id, workspace_id, type, data) VALUES (?, ?, ?, ?)')
      .run(record.id, record.workspace_id, type, JSON.stringify(record));
  }
  private update(type: string, record: Stored): void {
    this.db.prepare('UPDATE records SET data = ? WHERE id = ? AND workspace_id = ? AND type = ?')
      .run(JSON.stringify(record), record.id, record.workspace_id, type);
  }
  private requireText(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) this.invalid(`O campo ${field} é obrigatório.`);
    return value;
  }
  private invalid(message: string): never { throw new ArenaError('INVALID_INPUT', message); }
  private notFound(): never { throw new ArenaError('NOT_FOUND', 'Workspace ou recurso não encontrado.'); }
  private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
  private now(): string { return new Date().toISOString(); }
  private canonical(value: any): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(item => this.canonical(item)).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${this.canonical(value[key])}`).join(',')}}`;
  }
}
