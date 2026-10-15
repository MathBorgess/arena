import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ArenaError, dimensions, type Actor, type ArenaService, type BootstrapResult } from './contracts.js';
import { parseTextExport } from './import-text.js';

import type { Adapter, Branch, Decision, Dependencies, DimensionText, Feedback, PassageSelection, Profile, ProfileDecision, ProfileProposal, ProfileRevision, Proposal, RecordRegistry, RecordType, Revision, Session, Snapshot, Source, VoiceContent } from './domain-records.js';

// Untrusted wire arguments remain dynamic until each operation validates them. Stored domain records do not.
type Data = Record<string, any>;

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
    const result = this.dispatch(operation, actor, input);
    return this.sanitize(result, input.workspace_id);
  }

  private dispatch(operation: string, actor: Actor, input: Data): any {
    if (!input || typeof input !== 'object' || Array.isArray(input)) this.invalid('Argumentos devem ser um objeto.');
    const workspace = this.requireText(input.workspace_id, 'workspace_id');
    const persisted = this.authorize(actor, workspace);
    if (operation.startsWith('human.') && persisted.kind !== 'human') {
      throw new ArenaError('ACCESS_DENIED', 'Esta ação exige uma pessoa autenticada.');
    }
    this.checkRole(operation, persisted, workspace);
    this.checkInputCredentials(input, workspace);
    switch (operation) {
      case 'arena.list_work': return this.paginate('list_work', persisted, workspace, input, this.listWork(workspace, input), ['explorations']);
      case 'arena.read_context': return this.paginate('read_context', persisted, workspace, input, this.readContext(workspace, input), ['proposals', 'decisions', 'feedback', 'events', 'sources', 'sessions']);
      case 'arena.open_artifact': return this.paginate('read_context', persisted, workspace, input,
        this.openArtifact(workspace, input), ['proposals', 'decisions', 'feedback', 'events', 'sources', 'sessions']);
      case 'arena.read_events': return this.paginate('read_events', persisted, workspace, input, this.readEvents(workspace, persisted, input), ['events']);
      case 'arena.sync_context': return this.transaction(() => this.syncContext(workspace, persisted, input));
      case 'arena.compare_branches': return this.compareBranches(workspace, input);
      case 'arena.list_profiles': return this.listProfiles(workspace);
      case 'arena.read_source': return this.readSource(workspace, input);
      case 'arena.export_context': return this.exportContext(workspace, input);
      case 'human.list_sources': return { sources: this.list('source', workspace).map(source => this.sourceMetadata(source)) };
      case 'human.integration_status': return this.integrationStatus(workspace);
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
      case 'arena.create_branch': return this.mutate(operation, persisted, workspace, input, () => this.createBranch(workspace, persisted, input));
      case 'human.edit_branch': return this.mutate(operation, persisted, workspace, input, () => this.editBranch(workspace, persisted, input));
      case 'human.set_locks': return this.mutate(operation, persisted, workspace, input, () => this.setLocks(workspace, persisted, input));
      case 'human.review_artifacts': return this.mutate(operation, persisted, workspace, input, () => this.reviewArtifacts(workspace, persisted, input));
      case 'human.export_text': return this.mutate(operation, persisted, workspace, input, () => this.exportText(workspace, input));
      case 'human.create_profile': return this.mutate(operation, persisted, workspace, input, () => this.createProfile(workspace, persisted, input));
      case 'arena.propose_profile_change': return this.mutate(operation, persisted, workspace, input, () => this.proposeProfile(workspace, persisted, input));
      case 'human.approve_profile': return this.mutate(operation, persisted, workspace, input, () => this.approveProfile(workspace, persisted, input));
      case 'human.import_sources': return this.mutate(operation, persisted, workspace, input, () => this.importSources(workspace, persisted, input));
      case 'human.revoke_source':
      case 'human.remove_source': return this.mutate(operation, persisted, workspace, input,
        () => this.changeSource(operation, workspace, persisted, input));
      case 'human.invite_member': return this.mutate(operation, persisted, workspace, input, () => this.inviteMember(workspace, input));
      case 'human.revoke_member': return this.mutate(operation, persisted, workspace, input, () => this.revokeMember(workspace, persisted, input));
      case 'human.record_verification': return this.mutate(operation, persisted, workspace, input, () => this.recordVerification(workspace, persisted, input));
      case 'arena.record_interaction':
      case 'human.record_artifact_interaction': return this.mutate(operation, persisted, workspace, input,
        () => this.recordInteraction(operation, workspace, persisted, input));
      case 'arena.patch_artifact':
      case 'human.patch_artifact': return this.mutate(operation, persisted, workspace, input,
        () => this.patchArtifact(operation, workspace, persisted, input));
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

  private checkRole(operation: string, actor: Actor, workspace: string): void {
    const member = this.db.prepare('SELECT role FROM members WHERE workspace_id = ? AND actor_id = ? AND active = 1').get(workspace, actor.id)!;
    if (['human.invite_member', 'human.revoke_member', 'human.record_verification'].includes(operation) && member.role !== 'owner') {
      throw new ArenaError('ACCESS_DENIED', 'Esta ação exige o proprietário do workspace.');
    }
    const reviewerAllowed = new Set(['arena.list_work', 'arena.read_context', 'arena.open_artifact', 'arena.read_events', 'arena.sync_context',
      'arena.read_source', 'arena.compare_branches', 'arena.export_context', 'arena.list_profiles', 'arena.get_operation',
      'arena.add_feedback', 'arena.record_interaction', 'human.record_artifact_interaction', 'human.decide_proposal',
      'human.approve_profile', 'human.review_artifacts', 'human.export_text', 'human.list_sources', 'human.integration_status']);
    if (member.role === 'reviewer' && !reviewerAllowed.has(operation)) {
      throw new ArenaError('ACCESS_DENIED', 'O papel reviewer permite leitura, comentários e decisões; a edição exige editor.');
    }
  }

  private inviteMember(workspace: string, input: Data): Data {
    const row = this.db.prepare('SELECT revision FROM workspaces WHERE id = ?').get(workspace)!;
    if (input.expected_revision !== row.revision) throw new ArenaError('REVISION_CONFLICT', 'A lista de membros mudou.', { membership_revision: row.revision });
    if (!['human', 'agent'].includes(input.kind) || !['editor', 'reviewer'].includes(input.role)) this.invalid('Tipo ou papel de membro inválido.');
    const name = this.requireText(input.name, 'name');
    const actor = { id: randomUUID(), kind: input.kind };
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO actors (id, kind, name, token_hash) VALUES (?, ?, ?, ?)').run(actor.id, actor.kind, name, this.hash(token));
    this.db.prepare('INSERT INTO members (workspace_id, actor_id, role) VALUES (?, ?, ?)').run(workspace, actor.id, input.role);
    this.db.prepare('UPDATE workspaces SET revision = revision + 1 WHERE id = ?').run(workspace);
    return { actor, token, member_revision: 1, workspace_revision: Number(row.revision) + 1 };
  }

  private revokeMember(workspace: string, actor: Actor, input: Data): Data {
    const id = this.requireText(input.member_id, 'member_id');
    const member = this.db.prepare('SELECT revision, role, active FROM members WHERE workspace_id = ? AND actor_id = ?').get(workspace, id);
    if (!member) this.notFound();
    if (member.role === 'owner' || id === actor.id) this.invalid('O proprietário não pode revogar sua própria credencial.');
    if (member.revision !== input.expected_revision) throw new ArenaError('REVISION_CONFLICT', 'O membro mudou.', { member_id: id, revision: member.revision });
    this.requireText(input.reason, 'reason');
    this.db.prepare('UPDATE members SET active = 0, revision = revision + 1 WHERE workspace_id = ? AND actor_id = ?').run(workspace, id);
    this.db.prepare('UPDATE actors SET active = 0 WHERE id = ?').run(id);
    this.db.prepare('UPDATE workspaces SET revision = revision + 1 WHERE id = ?').run(workspace);
    return { member_id: id, revision: Number(member.revision) + 1 };
  }

  private integrationStatus(workspace: string): Data {
    const native = (['codex', 'chatgpt'] as const).map(provider => this.adapter(workspace, provider));
    const imported = this.list('source', workspace).length > 0;
    return { integrations: [...native,
      { provider: 'user-export', account: null, revision: 1, state: imported ? 'operation_tested' : 'available',
        capabilities: ['import_text_json', 'import_text_csv'], scopes: [workspace], last_verified: null,
        limitations: ['Importação de arquivo fornecido pelo usuário; não verifica autoria nem direitos declarados.', 'Cobertura limitada aos arquivos selecionados.'],
        pagination: 'Trechos de até 10000 caracteres UTF16', costs: 'Sem serviço pago', unavailable_reason: null },
      { provider: 'social-native', account: null, revision: 1, state: 'unavailable', capabilities: [], scopes: [], last_verified: null,
        limitations: ['Nenhuma API social nativa foi conectada ou verificada.'], pagination: null, costs: 'Não contratado',
        unavailable_reason: 'A v1 usa exportações JSON/CSV autorizadas; não acessa redes sociais.' }] };
  }

  private adapter(workspace: string, provider: Adapter['provider']): Adapter {
    const existing = this.list('adapter', workspace).find(adapter => adapter.provider === provider);
    return existing ?? { id: `${workspace}:${provider}`, workspace_id: workspace, provider, revision: 1,
      account: null, state: 'not_configured', capabilities: ['read_context', 'submit_proposal', 'artifact_interactions'], scopes: [workspace],
      last_verified: null, verifications: {}, evidence_type: 'owner_attestation',
      limitations: ['Nenhuma execução real deste cliente foi verificada automaticamente.', 'Renderização embutida depende do suporte do host.'],
      pagination: 'Cursores de snapshots autorizados', costs: 'Cliente externo; custos e assinatura dependem do usuário.',
      unavailable_reason: 'Configuração e participação real do cliente ainda não atestadas.' };
  }

  private recordVerification(workspace: string, actor: Actor, input: Data): Data {
    if (!['codex', 'chatgpt'].includes(input.provider)) this.invalid('Provedor de cliente não suportado.');
    const adapter = this.adapter(workspace, input.provider);
    if (input.expected_revision !== adapter.revision) throw new ArenaError('REVISION_CONFLICT', 'O registro de verificação mudou.', { revision: adapter.revision });
    const stages = ['not_configured', 'configured', 'authenticated', 'read_verified', 'operation_tested'];
    const next = stages.indexOf(input.stage);
    const current = stages.indexOf(adapter.state);
    if (next < 1 || next < current || next > current + 1) this.invalid('Ateste cada etapa em ordem: configured, authenticated, read_verified e operation_tested.');
    const evidence = this.requireText(input.evidence, 'evidence');
    this.assertNoCredential(evidence, workspace);
    adapter.state = input.stage;
    adapter.revision++;
    adapter.last_verified = this.now();
    adapter.unavailable_reason = null;
    adapter.verifications[input.stage] = { evidence, author: actor, created_at: adapter.last_verified };
    if (this.list('adapter', workspace).some(record => record.id === adapter.id)) this.update('adapter', adapter);
    else this.insert('adapter', adapter);
    return adapter;
  }

  private assertNoCredential(value: string, workspace: string, hashes = this.credentialHashes()): void {
    // Tokens may start anywhere within an allowed-character run, including next to other text.
    for (const run of value.match(/[A-Za-z0-9_-]{43,}/g) ?? []) {
      for (let start = 0; start <= run.length - 43; start++) {
        if (hashes.has(this.hash(run.slice(start, start + 43)))) {
          this.invalid('Credenciais não podem ser registradas no contexto.');
        }
      }
    }
  }

  private credentialHashes(): Set<string> {
    return new Set(this.db.prepare('SELECT token_hash FROM actors').all().map(row => String(row.token_hash)));
  }

  private createExploration(workspace: string, actor: Actor, input: Data): Data {
    const title = this.requireText(input.title, 'title');
    const objective = this.requireText(input.objective, 'objective');
    const profile_revision_id = input.profile_revision_id == null ? null : this.get('profile_revision', workspace, input.profile_revision_id).id;
    if (profile_revision_id) this.validateSourceIds(workspace, this.get('profile_revision', workspace, profile_revision_id).source_ids);
    const exploration_id = randomUUID();
    const branch_id = randomUUID();
    const revision_id = randomUUID();
    this.insert('exploration', { id: exploration_id, workspace_id: workspace, title, objective, author: actor, created_at: this.now() });
    this.insert('branch', { id: branch_id, workspace_id: workspace, exploration_id, name: 'Principal',
      origin_branch_id: null, origin_revision_id: null, current_revision_id: revision_id, profile_revision_id });
    this.insert('revision', { id: revision_id, workspace_id: workspace, branch_id, parent_revision_id: null,
      fields: Object.fromEntries(dimensions.map(dimension => [dimension, ''])), locks: {}, artifacts: {},
      profile_revision_id, author: actor, created_at: this.now() });
    return { exploration_id, branch_id, revision_id };
  }

  private listWork(workspace: string, input: Data): Data {
    const branches = this.list('branch', workspace);
    const query = typeof input.query === 'string' ? input.query.toLocaleLowerCase() : '';
    const explorations = this.list('exploration', workspace).filter(exploration =>
      !query || `${exploration.title} ${exploration.objective} ${branches.filter(branch => branch.exploration_id === exploration.id)
        .map(branch => Object.values(this.sanitize(this.get('revision', workspace, branch.current_revision_id), workspace).fields).join(' ')).join(' ')}`
        .toLocaleLowerCase().includes(query)
    ).map(exploration => ({ id: exploration.id, title: exploration.title, objective: exploration.objective,
      branches: branches.filter(branch => branch.exploration_id === exploration.id).map(branch => ({
        id: branch.id, name: branch.name, current_revision_id: branch.current_revision_id,
        profile_revision_id: branch.profile_revision_id
      })) }));
    const membership_revision = this.db.prepare('SELECT revision FROM workspaces WHERE id = ?').get(workspace)!.revision;
    return { explorations, next_cursor: null, membership_revision };
  }

  private readContext(workspace: string, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    const exploration = this.get('exploration', workspace, branch.exploration_id);
    const revision = this.get('revision', workspace, input.revision_id ?? branch.current_revision_id);
    if (revision.branch_id !== branch.id) this.notFound();
    const proposals = this.list('proposal', workspace).filter(proposal => proposal.branch_id === branch.id);
    const decisions = this.list('decision', workspace).filter(decision => decision.branch_id === branch.id);
    const feedback = this.list('feedback', workspace).filter(item => item.branch_id === branch.id);
    const profile = revision.profile_revision_id ? this.get('profile_revision', workspace, revision.profile_revision_id) : null;
    const dna = this.productionDna(workspace, branch);
    const source_ids = new Set([...this.revisionSources(revision), ...proposals.flatMap(proposal => proposal.source_ids), ...(profile?.source_ids ?? []), ...dna.source_ids]);
    return { format_version: 1, workspace_id: workspace,
      exploration: { id: exploration.id, title: exploration.title, objective: exploration.objective },
      branch: { id: branch.id, name: branch.name, origin_branch_id: branch.origin_branch_id,
        origin_revision_id: branch.origin_revision_id, current_revision_id: branch.current_revision_id,
        profile_revision_id: branch.profile_revision_id },
      revision: { id: revision.id, fields: revision.fields, locks: revision.locks, artifacts: revision.artifacts,
        profile_revision_id: revision.profile_revision_id },
      profile, dna, proposals, decisions, feedback,
      sources: this.list('source', workspace).filter(source => source_ids.has(source.id)).map(source => this.sourceMetadata(source)),
      events: this.list('event', workspace).filter(event => event.branch_id === branch.id),
      sessions: this.list('session', workspace).filter(session => session.branch_id === branch.id),
      open_questions: feedback.filter(item => item.type === 'question').map(item => ({ id: item.id, text: item.text, source_ids: item.source_ids })),
      next_action: proposals.some(proposal => proposal.status === 'pending')
        ? 'Revise as propostas pendentes e solicite uma decisão humana.' : 'Proponha um próximo passo para esta exploração.',
      next_cursor: null };
  }

  private artifactProposal(workspace: string, branch: Branch, input: Data): Proposal | undefined {
    if (input.presented_version !== undefined && input.proposal_id === undefined) this.invalid('presented_version exige proposal_id.');
    const proposal = input.proposal_id !== undefined
      ? this.get('proposal', workspace, input.proposal_id)
      : (input.revision_id !== undefined ? [] : this.list('proposal', workspace)).filter(item => item.branch_id === branch.id && item.status === 'pending' &&
          Object.hasOwn(item.changes, 'text') && item.base_revision_id === branch.current_revision_id).at(-1);
    if (!proposal) return undefined;
    if (proposal.branch_id !== branch.id) this.notFound();
    if (proposal.status !== 'pending' || !Object.hasOwn(proposal.changes, 'text') ||
      input.presented_version !== undefined && input.presented_version !== proposal.version ||
      input.revision_id !== undefined && input.revision_id !== proposal.base_revision_id) {
      throw new ArenaError('REVISION_CONFLICT', 'A proposta apresentada não corresponde ao texto pendente atual.',
        { proposal_id: proposal.id, current_version: proposal.version }, false, 'Abra novamente a proposta e selecione o trecho da versão exata.');
    }
    return proposal;
  }

  private openArtifact(workspace: string, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    if (input.surface !== undefined && !['text', 'dna'].includes(input.surface)) this.invalid('Bloco inválido.');
    if (input.surface === 'dna') return { ...this.readContext(workspace, input), artifact: this.productionDna(workspace, branch),
      presentation: { follow_current: true } };
    const proposal = this.artifactProposal(workspace, branch, input);
    const revision = this.get('revision', workspace, proposal?.base_revision_id ?? input.revision_id ?? branch.current_revision_id);
    if (revision.branch_id !== branch.id) this.notFound();
    const safe = this.sanitize(proposal ?? revision, workspace);
    const source_ids = proposal?.source_ids ?? revision.artifacts.text?.source_ids ?? [];
    return { ...this.readContext(workspace, { ...input, revision_id: revision.id }), artifact: {
      branch_id: branch.id, revision_id: revision.id, current_revision_id: branch.current_revision_id,
      kind: proposal ? 'proposal' : 'accepted', text: proposal ? safe.changes.text : safe.fields.text,
      source_ids, ...(proposal ? { proposal_id: proposal.id, presented_version: proposal.version } : {}),
      ...(safe.redacted || safe.artifacts?.text?.redacted ? { redacted: true } : {})
    }, presentation: { resource_uri: 'ui://arena/artifact/v1.html', format: 'mcp-apps', requires_host_support: true,
      fallback: 'local_authenticated_viewer', human_actions_require_authentication: true, follow_current: input.revision_id === undefined && input.proposal_id === undefined } };
  }

  private productionDna(workspace: string, branch: Branch): Data {
    const revision = this.get('revision', workspace, branch.current_revision_id);
    const stored = this.list('production_dna', workspace).filter(d => d.branch_id === branch.id).at(-1);
    const exploration = this.get('exploration', workspace, branch.exploration_id);
    const profile = revision.profile_revision_id ? this.get('profile_revision', workspace, revision.profile_revision_id) : null;
    const source_ids = stored?.source_ids ?? [...new Set([...this.revisionSources(revision),
      ...(this.artifactProposal(workspace, branch, {})?.source_ids ?? [])])];
    const render = (value: unknown) => Array.isArray(value) ? value.join('\n') : value || 'Ainda não definido.';
    const text = stored?.text ?? [
      '# DNA desta produção (rascunho)', `## Intenção\n${exploration.objective}`,
      `## Identidade e voz\n${render(profile?.content.identity)}\n${render(profile?.content.tone)}`,
      `## Público\n${render(revision.fields.audience)}`, `## Tese e ângulo\n${render(revision.fields.thesis)}\n${render(revision.fields.angle)}`,
      `## Estrutura\n${render(revision.fields.structure)}`, `## Vocabulário\n${render(profile?.content.vocabulary)}`,
      `## Regras e limites\n${render(profile?.content.rules)}`, '## Repertório e referências\nAinda não definido.',
      '## Nuances confirmadas pelo autor\nAinda não definido.', '## Hipóteses do agente\nAinda não definido.'
    ].join('\n\n');
    const safe = this.sanitize({ text, source_ids }, workspace);
    return { surface: 'dna', kind: 'dna', branch_id: branch.id, revision_id: revision.id, current_revision_id: revision.id,
      dna_id: stored?.id ?? `dna:${branch.id}:${revision.id}`, dna_version: stored?.version ?? 0,
      ...safe };
  }

  private submitProposal(workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const base = this.get('revision', workspace, input.base_revision_id);
    if (base.branch_id !== branch.id) this.notFound();
    if (base.id !== branch.current_revision_id) this.conflict(branch, base.id);
    const changes = this.validateChanges(input.changes);
    const dependencies = this.validateDependencies(input.dependencies, changes);
    const source_ids = this.validateSourceIds(workspace, this.inferredSources(base, changes, dependencies, input.source_ids));
    const rationale = this.requireText(input.rationale, 'rationale');
    if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.some((warning: unknown) => typeof warning !== 'string'))) {
      this.invalid('warnings deve ser uma lista de textos.');
    }
    const proposal: Proposal = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
      base_revision_id: base.id, version: 1, status: 'pending', changes, dependencies, rationale, source_ids,
      warnings: [...(input.warnings ?? [])], author: actor, created_at: this.now(), origin_proposal_id: null };
    if (branch.profile_revision_id) proposal.warnings.push('A fidelidade às regras qualitativas da voz exige avaliação humana.');
    if (input.session_metadata !== undefined) {
      const metadata = input.session_metadata;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) this.invalid('Metadados da sessão inválidos.');
      for (const key of ['provider', 'client_name']) {
        if (typeof metadata[key] !== 'string' || !metadata[key].trim() || metadata[key].length > 200) this.invalid('Declare o provedor e o nome do cliente.');
      }
      for (const key of ['external_session_id', 'client_version']) if (metadata[key] !== undefined &&
        (typeof metadata[key] !== 'string' || !metadata[key].trim() || metadata[key].length > 200)) this.invalid('Metadado opcional da sessão inválido.');
      const session: Session = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
        provider: metadata.provider, client_name: metadata.client_name, external_session_id: metadata.external_session_id ?? null,
        ...(metadata.client_version ? { client_version: metadata.client_version } : {}),
        input_revision_id: base.id, source_ids, proposal_ids: [proposal.id], verification: 'declared',
        author: actor, created_at: this.now() };
      this.insert('session', session);
      proposal.session_id = session.id;
    }
    this.insert('proposal', proposal);
    return { proposal_id: proposal.id, version: proposal.version, status: proposal.status,
      ...(proposal.session_id ? { session_id: proposal.session_id } : {}) };
  }

  private textPatch(before: string, after: string): Data {
    let start = 0, end = before.length, nextEnd = after.length;
    while (start < end && start < nextEnd && before[start] === after[start]) start++;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    return { start, end, text: after.slice(start, nextEnd) };
  }

  private syncContext(workspace: string, actor: Actor, input: Data): Data {
    const opened = this.sanitize(this.openArtifact(workspace, { branch_id: input.branch_id }), workspace);
    const events = opened.events;
    const artifact = opened.artifact;
    const dna = opened.dna;
    const latest = [...events].reverse().find((event: Data) => ['selection', 'selection_clear', 'text_edit', 'dna_edit'].includes(event.type));
    const selectedArtifact = latest?.surface === 'dna' ? dna : artifact;
    const selection = latest?.type === 'selection' && !latest.redacted && latest.revision_id === selectedArtifact.revision_id &&
      (latest.dna_id ?? latest.proposal_id ?? latest.revision_id) === (selectedArtifact.dna_id ?? selectedArtifact.proposal_id ?? selectedArtifact.revision_id) &&
      latest.selection && selectedArtifact.text.slice(latest.selection.start, latest.selection.end) === latest.selection.text ? latest.selection : null;
    const context = { workspace_id: workspace, exploration: opened.exploration, branch: opened.branch,
      revision: opened.revision, profile: opened.profile, sources: opened.sources,
      feedback: opened.feedback.slice(-20), decisions: opened.decisions.slice(-20),
      proposals: opened.proposals.slice(-20).map((p: Data) => ({ id: p.id, version: p.version, status: p.status, base_revision_id: p.base_revision_id })) };
    const restriction_stamp = this.hash(this.canonical(this.list('source', workspace).map(s => [s.id, s.revision, s.status, s.rights, s.usage_scope])));
    const state: Data = { context, artifact, dna, selection, selection_surface: latest?.surface ?? 'text' };
    let previous: Data | undefined;
    const scope = `sync:${input.branch_id}`;
    if (input.sync_cursor !== undefined) {
      let token: any;
      try { token = JSON.parse(Buffer.from(input.sync_cursor, 'base64url').toString('utf8')); }
      catch { return this.invalid('Checkpoint de sincronização inválido.'); }
      const prior = this.get('snapshot', workspace, token?.id);
      if (prior.actor_id !== actor.id || prior.scope !== scope) this.notFound();
      previous = prior.payload;
    }
    const snapshot: Snapshot = { id: randomUUID(), workspace_id: workspace, actor_id: actor.id, scope,
      payload: { state, restriction_stamp, event_count: events.length }, created_at: this.now() };
    this.insert('snapshot', snapshot);
    const sync_cursor = Buffer.from(JSON.stringify({ id: snapshot.id })).toString('base64url');
    if (!previous || previous.restriction_stamp !== restriction_stamp) {
      return { mode: 'full', reset: !!previous, state, events: events.slice(-20).map(this.contextEvent), sync_cursor };
    }
    const before = (previous.state as Data).artifact;
    const changed = this.canonical(before) !== this.canonical(artifact);
    const { text: _text, ...after } = artifact;
    const oldDna = (previous.state as Data).dna;
    const { text: _dnaText, ...afterDna } = dna;
    return { mode: 'delta', artifact: changed ? { before_artifact_id: before.proposal_id ?? before.revision_id,
      after, patch: this.textPatch(before.text, artifact.text) } : null,
      dna: this.canonical(oldDna) !== this.canonical(dna) ? { before_artifact_id: oldDna.dna_id, after: afterDna,
        patch: this.textPatch(oldDna.text, dna.text) } : null,
      ...(this.canonical((previous.state as Data).context) !== this.canonical(context) ? { context: Object.fromEntries(
        Object.entries(context).filter(([key, value]) => this.canonical(((previous.state as Data).context as Data)[key]) !== this.canonical(value))) } : {}),
      selection, selection_surface: latest?.surface ?? 'text', events: events.slice(previous.event_count as number).map(this.contextEvent), sync_cursor };
  }

  private contextEvent(event: Data): Data {
    // Historical passages/patch bodies stay in the audit API, never become active context again.
    const { selection: _selection, patch: _patch, ...metadata } = event;
    return metadata;
  }

  private patchArtifact(operation: string, workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const current = this.openArtifact(workspace, { branch_id: branch.id, surface: input.surface }).artifact;
    const artifact_id = current.dna_id ?? current.proposal_id ?? current.revision_id;
    if (input.artifact_id !== artifact_id || input.presented_version !== (current.dna_version ?? current.presented_version ?? 0)) {
      throw new ArenaError('REVISION_CONFLICT', 'O bloco mudou enquanto você escrevia. Seu texto foi preservado localmente.',
        { branch_id: branch.id, artifact_id, presented_version: current.presented_version ?? 0 });
    }
    this.validateSourceIds(workspace, current.source_ids);
    if (current.redacted) throw new ArenaError('SOURCE_UNAVAILABLE', 'O bloco usa uma fonte indisponível.');
    const patch = input.patch;
    if (!patch || !Number.isSafeInteger(patch.start) || !Number.isSafeInteger(patch.end) || patch.start < 0 ||
      patch.end < patch.start || patch.end > current.text.length || typeof patch.text !== 'string') this.invalid('Alteração de texto inválida.');
    const text = current.text.slice(0, patch.start) + patch.text + current.text.slice(patch.end);
    if (text.length > 50_000) this.invalid('O bloco aceita até 50000 caracteres.');
    let artifact: Data;
    if (current.surface === 'dna') {
      const saved: RecordRegistry['production_dna'] = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
        version: current.dna_version + 1, text, previous_id: current.dna_version ? current.dna_id : null,
        source_ids: current.source_ids, author: actor, created_at: this.now() };
      this.insert('production_dna', saved);
      artifact = { ...current, dna_id: saved.id, dna_version: saved.version };
    } else {
      const saved = this.submitProposal(workspace, actor, { branch_id: branch.id, expected_revision: branch.current_revision_id,
        base_revision_id: branch.current_revision_id, changes: { text }, dependencies: { text: [] },
        source_ids: current.source_ids, rationale: input.rationale === undefined ? 'Alteração incremental no bloco de texto.' : this.requireText(input.rationale, 'rationale') });
      const proposal = this.get('proposal', workspace, saved.proposal_id);
      proposal.origin_proposal_id = current.proposal_id ?? null;
      this.update('proposal', proposal);
      artifact = { ...current, kind: 'proposal', proposal_id: proposal.id, presented_version: proposal.version };
    }
    delete artifact.text;
    const id = randomUUID();
    const event = { id, event_id: id, workspace_id: workspace, artifact_id: branch.id, branch_id: branch.id,
      revision_id: branch.current_revision_id, type: current.surface === 'dna' ? 'dna_edit' : 'text_edit', operation, dimension: 'text', selection: null,
      ...(current.surface === 'dna' ? { surface: 'dna' as const, dna_id: artifact.dna_id, dna_version: artifact.dna_version }
        : { proposal_id: artifact.proposal_id, presented_version: artifact.presented_version }), patch: { ...patch },
      before_artifact_id: artifact_id, comment: input.rationale === undefined ? '' : this.requireText(input.rationale, 'rationale'),
      source_ids: current.source_ids, author: actor, created_at: this.now(),
      ui_origin: operation === 'human.patch_artifact' ? 'authenticated_human_channel' as const : 'unverified' as const };
    this.insert('event', event);
    return { artifact, patch: { ...patch }, before_artifact_id: artifact_id, event_id: id, event, status: 'pending',
      sync: this.syncContext(workspace, actor, { branch_id: branch.id, sync_cursor: input.sync_cursor }) };
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
    const feedback: Feedback = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
      target_id: input.target_id, revision_id: revision.id, text: this.requireText(input.text, 'text'),
      type: input.type, source_ids: this.revisionSources(revision), author: actor, created_at: this.now() };
    if (input.target_id !== branch.id) feedback.source_ids = [...new Set([...feedback.source_ids, ...this.get('proposal', workspace, input.target_id).source_ids])];
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
      this.validateSourceIds(workspace, acceptedProposal.source_ids);
      const previous = this.get('revision', workspace, branch.current_revision_id);
      const revision = this.changedRevision(previous, acceptedProposal.changes, acceptedProposal.dependencies, acceptedProposal.source_ids, proposal.author);
      revision.author = actor;
      if (proposal.session_id) for (const dimension of Object.keys(acceptedProposal.changes)) revision.artifacts[dimension].session_id = proposal.session_id;
      this.commitRevision(branch, revision);
      revision_id = revision.id;
    }
    acceptedProposal.status = input.decision;
    this.update('proposal', acceptedProposal);
    const decision: Decision = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id,
      proposal_id: acceptedProposal.id, presented_proposal_id: proposal.id,
      presented_version: proposal.version, decision: input.decision,
      base_revision_id: proposal.base_revision_id, examined_revision_id: input.expected_head_revision,
      revision_id: revision_id ?? null, selected_dimensions: selected,
      comment: input.comment ?? '', source_ids: [...new Set([...proposal.source_ids,
        ...this.revisionSources(this.get('revision', workspace, proposal.base_revision_id))])], author: actor, created_at: this.now() };
    this.insert('decision', decision);
    return { decision_id: decision.id, ...(revision_id ? { revision_id } : {}), proposal_id: proposal.id,
      ...(partial ? { derived_proposal_id: acceptedProposal.id } : {}) };
  }

  private validateChanges(value: unknown): DimensionText {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
      return this.invalid('changes deve indicar ao menos uma dimensão.');
    }
    for (const [dimension, content] of Object.entries(value)) {
      if (!dimensions.includes(dimension as any) || typeof content !== 'string') this.invalid('Dimensão ou texto inválido.');
    }
    return { ...value } as DimensionText;
  }

  private createBranch(workspace: string, actor: Actor, input: Data): Data {
    const source = this.get('branch', workspace, input.source_branch_id);
    this.expectHead(source, input.expected_revision);
    const base = this.get('revision', workspace, input.source_revision_id);
    if (base.branch_id !== source.id) this.notFound();
    if (input.include_current_draft !== undefined && typeof input.include_current_draft !== 'boolean') this.invalid('include_current_draft deve ser booleano.');
    if (input.include_current_draft && base.id !== source.current_revision_id) this.conflict(source, base.id);
    this.validateSourceIds(workspace, this.revisionSources(base));
    const vary_dimensions = this.validateDimensions(input.vary_dimensions);
    const locks = this.validateLocks(input.locks ?? base.locks, base.fields);
    for (const [dimension, value] of Object.entries(base.locks)) {
      if (locks[dimension] !== value) throw new ArenaError('LOCK_VIOLATION', 'Uma ramificação deve preservar as travas da origem.', { dimension });
    }
    const branch_id = randomUUID();
    const revision_id = randomUUID();
    this.insert('branch', { id: branch_id, workspace_id: workspace, exploration_id: source.exploration_id,
      name: this.requireText(input.name, 'name'), origin_branch_id: source.id, origin_revision_id: base.id,
      current_revision_id: revision_id, profile_revision_id: base.profile_revision_id, vary_dimensions });
    this.insert('revision', { ...base, id: revision_id, branch_id, parent_revision_id: base.id, locks,
      author: actor, created_at: this.now() });
    if (input.include_current_draft) {
      const draft = this.openArtifact(workspace, { branch_id: source.id }).artifact;
      const dna = this.productionDna(workspace, source);
      this.validateSourceIds(workspace, [...draft.source_ids, ...dna.source_ids]);
      if (draft.redacted || dna.redacted) throw new ArenaError('SOURCE_UNAVAILABLE', 'A produção contém referências indisponíveis.');
      if (draft.proposal_id) {
        const proposed = this.submitProposal(workspace, actor, { branch_id, expected_revision: revision_id, base_revision_id: revision_id,
          changes: { text: draft.text }, dependencies: { text: [] }, source_ids: draft.source_ids, rationale: 'Variação do rascunho atual, sem aceite implícito.' });
        const proposal = this.get('proposal', workspace, proposed.proposal_id);
        proposal.origin_proposal_id = draft.proposal_id; this.update('proposal', proposal);
      }
      this.insert('production_dna', { id: randomUUID(), workspace_id: workspace, branch_id, version: 1, text: dna.text,
        previous_id: dna.dna_version ? dna.dna_id : null, source_ids: dna.source_ids, author: actor, created_at: this.now() });
    }
    return { branch_id, revision_id };
  }

  private createProfile(workspace: string, actor: Actor, input: Data): Data {
    const content = this.validateVoice(input.content, false);
    const source_ids = this.validateSourceIds(workspace, input.source_ids);
    const profile_id = randomUUID();
    const profile_revision_id = randomUUID();
    this.insert('profile', { id: profile_id, workspace_id: workspace, name: this.requireText(input.name, 'name'),
      current_revision_id: profile_revision_id, source_ids });
    this.insert('profile_revision', { id: profile_revision_id, workspace_id: workspace, profile_id,
      version: 1, content, source_ids, author: actor, created_at: this.now() });
    return { profile_id, profile_revision_id };
  }

  private readEvents(workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    const all = this.list('event', workspace).filter(event => event.branch_id === branch.id);
    let after = -1;
    if (input.since_cursor != null) {
      let token: any;
      try { token = JSON.parse(Buffer.from(input.since_cursor, 'base64url').toString('utf8')); }
      catch { return this.invalid('Checkpoint de eventos inválido.'); }
      const checkpoint = this.get('event_checkpoint', workspace, token?.checkpoint_id);
      if (checkpoint.actor_id !== actor.id || checkpoint.branch_id !== branch.id) this.notFound();
      if (checkpoint.after_event_id) {
        after = all.findIndex(event => event.id === checkpoint.after_event_id);
        if (after < 0) this.notFound();
      }
    }
    const checkpoint: RecordRegistry['event_checkpoint'] = { id: randomUUID(), workspace_id: workspace, branch_id: branch.id, actor_id: actor.id,
      after_event_id: all.at(-1)?.id ?? null };
    this.insert('event_checkpoint', checkpoint);
    return { events: all.slice(after + 1), next_cursor: null, current_revision_id: branch.current_revision_id,
      event_cursor: Buffer.from(JSON.stringify({ checkpoint_id: checkpoint.id })).toString('base64url') };
  }

  private paginate(kind: string, actor: Actor, workspace: string, input: Data, payload: Data, arrays: string[]): Data {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) this.invalid('Use limit entre 1 e 500.');
    const scope = this.canonical({ kind, branch_id: input.branch_id ?? null, revision_id: input.revision_id ?? null,
      query: input.query ?? null, since_cursor: input.since_cursor ?? null });
    let snapshot: Snapshot;
    let offset = 0;
    if (input.cursor !== undefined && input.cursor !== null) {
      let cursor: any;
      try { cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); }
      catch { return this.invalid('Cursor inválido.'); }
      if (!cursor || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || typeof cursor.id !== 'string') this.invalid('Cursor inválido.');
      snapshot = this.get('snapshot', workspace, cursor.id);
      if (snapshot.actor_id !== actor.id || snapshot.scope !== scope) this.notFound();
      payload = snapshot.payload;
      offset = cursor.offset;
    } else {
      snapshot = { id: randomUUID(), workspace_id: workspace, actor_id: actor.id, scope, payload, created_at: this.now() };
      this.insert('snapshot', snapshot);
    }
    const result = { ...payload };
    for (const key of arrays) result[key] = (payload[key] ?? []).slice(offset, offset + limit);
    result.next_cursor = arrays.some(key => (payload[key] ?? []).length > offset + limit)
      ? Buffer.from(JSON.stringify({ id: snapshot.id, offset: offset + limit })).toString('base64url') : null;
    return result;
  }

  private recordInteraction(operation: string, workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const revision = this.get('revision', workspace, input.revision_id);
    if (revision.branch_id !== branch.id) this.notFound();
    if (revision.id !== branch.current_revision_id && !['selection', 'selection_clear'].includes(input.type)) this.conflict(branch, revision.id);
    const dna = input.surface === 'dna' ? this.productionDna(workspace, branch) : undefined;
    if (dna && (input.dna_id !== dna.dna_id || input.dna_version !== dna.dna_version)) {
      throw new ArenaError('REVISION_CONFLICT', 'O DNA mudou. Selecione o trecho da versão atual.');
    }
    const proposal = !dna && (input.proposal_id !== undefined || input.presented_version !== undefined) ? this.artifactProposal(workspace, branch, input) : undefined;
    if (proposal && (input.dimension !== 'text' || input.presented_version !== proposal.version)) this.invalid('Informe a versão exata da proposta de texto.');
    const selectedContent = dna ? dna.text : proposal ? proposal.changes.text : revision.fields[input.dimension];
    if (!dimensions.includes(input.dimension)) this.invalid('Dimensão inválida.');
    if (!['selection', 'selection_clear', 'comment', 'request_revision'].includes(input.type)) this.invalid('Tipo de interação inválido.');
    let selection: PassageSelection | undefined;
    if (input.type === 'selection_clear' && input.comment !== undefined) this.invalid('Uma seleção vazia não inclui comentário.');
    if (input.type === 'selection_clear' && input.selection != null) this.invalid('Uma seleção vazia não contém trecho.');
    if (input.selection != null) {
      const value = input.selection;
      if (!value || !Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || value.start < 0 ||
        value.end <= value.start || value.end > selectedContent.length || typeof value.text !== 'string' ||
        selectedContent.slice(value.start, value.end) !== value.text) this.invalid('A seleção deve corresponder ao trecho da revisão exata.');
      selection = { start: value.start, end: value.end, text: value.text };
    }
    if (input.type === 'selection' && !selection) this.invalid('Uma seleção de texto é obrigatória.');
    if (input.comment !== undefined && typeof input.comment !== 'string') this.invalid('O comentário deve ser texto.');
    if (!['selection', 'selection_clear'].includes(input.type) && !selection && !input.comment?.trim()) this.invalid('Informe um comentário ou trecho para a interação.');
    const source_ids = input.type === 'selection_clear' ? [] : dna?.source_ids ?? proposal?.source_ids ?? revision.artifacts[input.dimension]?.source_ids ?? [];
    this.validateSourceIds(workspace, source_ids);
    const id = randomUUID();
    const event: RecordRegistry['event'] = { id, event_id: id, workspace_id: workspace, artifact_id: branch.id, branch_id: branch.id,
      revision_id: revision.id, type: input.type, operation, dimension: input.dimension,
      ...(selection ? { selection } : input.type === 'selection_clear' ? { selection: null } : {}),
      ...(proposal ? { proposal_id: proposal.id, presented_version: proposal.version } : {}), comment: input.comment ?? '', source_ids,
      ...(dna ? { surface: 'dna', dna_id: dna.dna_id, dna_version: dna.dna_version } : {}),
      author: actor, created_at: this.now(), ui_origin: operation === 'arena.record_interaction' ? 'unverified' : 'authenticated_human_channel' };
    this.insert('event', event);
    return { event_id: id, revision_id: revision.id, event,
      event_cursor: this.readEvents(workspace, actor, { branch_id: branch.id }).event_cursor,
      sync: this.syncContext(workspace, actor, { branch_id: branch.id, sync_cursor: input.sync_cursor }) };
  }

  private importSources(workspace: string, actor: Actor, input: Data): Data {
    const items = parseTextExport(input.format, input.content);
    const source_ids: string[] = [];
    for (const item of items) {
      const metadata: Pick<Source, 'origin' | 'rights' | 'usage_scope' | 'coverage' | 'author' | 'date'> = {
        origin: '', rights: '', usage_scope: '', coverage: '', author: null, date: null
      };
      for (const field of ['origin', 'rights', 'usage_scope', 'coverage'] as const) {
        metadata[field] = this.requireText(item[field] ?? input[field], field);
      }
      for (const field of ['author', 'date'] as const) {
        const value = item[field] ?? input[field] ?? null;
        if (value !== null && typeof value !== 'string') this.invalid(`Metadado ${field} inválido.`);
        metadata[field] = value;
      }
      const source: Source = { id: randomUUID(), workspace_id: workspace, revision: 1, status: 'active',
        content: String(item.text).replace(/\r\n?/g, '\n'), ...metadata, imported_by: actor, created_at: this.now() };
      this.insert('source', source);
      source_ids.push(source.id);
    }
    return { source_ids, integration: { provider: 'user-export', state: 'operation_tested', capabilities: ['import_text'],
      limitations: ['Arquivo fornecido pelo usuário; autorização declarada; cobertura limitada à amostra importada.',
        'Não é uma conexão nativa com redes sociais.'], coverage: input.coverage ?? 'Metadados por fonte' } };
  }

  private sourceMetadata(source: Source): Data {
    return Object.fromEntries(['id', 'revision', 'status', 'origin', 'author', 'date', 'rights', 'usage_scope', 'coverage']
      .map(key => [key, source[key as keyof Source]]));
  }

  private sourcePermitted(source: Source): boolean {
    const denied = /^(unknown|none|denied|unlicensed|sem permissão|não autorizado|proibido)$/i;
    return source.status === 'active' && typeof source.rights === 'string' && !!source.rights.trim() &&
      typeof source.usage_scope === 'string' && !!source.usage_scope.trim() &&
      !denied.test(source.rights.trim()) && !denied.test(source.usage_scope.trim());
  }

  private changeSource(operation: string, workspace: string, actor: Actor, input: Data): Data {
    const source = this.get('source', workspace, input.source_id);
    if (source.revision !== input.expected_revision) throw new ArenaError('REVISION_CONFLICT', 'A fonte mudou.',
      { source_id: source.id, current_revision: source.revision });
    if (source.status === 'removed') throw new ArenaError('SOURCE_UNAVAILABLE', 'A fonte já foi removida.');
    this.requireText(input.reason, 'reason');
    source.status = operation === 'human.remove_source' ? 'removed' : 'revoked';
    source.revision++;
    source.changed_by = actor;
    this.update('source', source);
    for (const branch of this.list('branch', workspace)) {
      const revision = this.get('revision', workspace, branch.current_revision_id);
      const proposals = this.list('proposal', workspace).filter(proposal => proposal.branch_id === branch.id);
      if (!this.revisionSources(revision).includes(source.id) && !proposals.some(proposal => proposal.source_ids.includes(source.id))) continue;
      const id = randomUUID();
      this.insert('event', { id, event_id: id, workspace_id: workspace, artifact_id: branch.id, branch_id: branch.id,
        revision_id: revision.id, type: source.status === 'removed' ? 'source_removed' : 'source_revoked', operation,
        source_ids: [source.id], author: actor, created_at: this.now(), references: { source_id: source.id, source_revision: source.revision } });
    }
    if (source.status === 'removed') {
      // Erase originals and controlled derived text, including saved read snapshots and replay payloads.
      const rows = this.db.prepare('SELECT id, type, data FROM records WHERE workspace_id = ?').all(workspace);
      const erasedRows = rows.map(row => {
        const record = JSON.parse(String(row.data));
        const erased = this.sanitize(record, workspace, true);
        if (row.type === 'source' && record.id === source.id) erased.content = '';
        return { type: String(row.type) as RecordType, erased };
      });
      const operations = this.db.prepare('SELECT actor_id, key, result FROM operations WHERE workspace_id = ?').all(workspace);
      const erasedOperations = operations.map(row => ({ actor_id: row.actor_id!, key: row.key!,
        erased: this.sanitize(JSON.parse(String(row.result)), workspace, true) }));
      for (const { type, erased } of erasedRows) this.update(type, erased);
      for (const row of erasedOperations) {
        this.db.prepare('UPDATE operations SET result = ? WHERE workspace_id = ? AND actor_id = ? AND key = ?')
          .run(JSON.stringify(row.erased), workspace, row.actor_id!, row.key!);
      }
    }
    return { source_id: source.id, status: source.status, revision: source.revision };
  }

  private sanitize(value: any, workspace: string, retainProvenance = false): any {
    const unavailable = this.list('source', workspace).filter(source => !this.sourcePermitted(source));
    const blocked = new Set(unavailable.map(source => source.id));
    const terms = unavailable.map(source => source.content).filter(content => typeof content === 'string' && content.length > 0);
    const blank = (item: any): any => typeof item === 'string' ? '' : Array.isArray(item) ? [] : item && typeof item === 'object'
      ? Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, blank(entry)])) : item;
    const sensitive = new Set(['content', 'changes', 'patch', 'rationale', 'comment', 'text', 'reason', 'selection', 'markdown', 'name', 'warnings',
      'provider', 'client_name', 'client_version', 'external_session_id', 'date', 'origin', 'rights', 'usage_scope', 'coverage']);
    // These fields are assigned or validated by Arena. Declarations such as external_session_id,
    // provider and source dates are free text, even when their names resemble identifiers.
    const identifiers = new Set(['id', 'workspace_id', 'actor_id', 'branch_id', 'artifact_id', 'event_id', 'proposal_id', 'session_id',
      'revision_id', 'profile_id', 'profile_revision_id', 'exploration_id', 'source_id', 'target_id', 'decision_id', 'feedback_id',
      'parent_revision_id', 'current_revision_id', 'base_revision_id', 'input_revision_id', 'origin_branch_id', 'origin_revision_id',
      'origin_proposal_id', 'presented_proposal_id', 'examined_revision_id', 'after_event_id', 'derived_proposal_id', 'checkpoint_id', 'member_id', 'kind', 'role', 'type', 'operation',
      'status', 'state', 'verification', 'created_at', 'last_verified', 'resource_uri', 'proposal_ids',
      'next_cursor', 'event_cursor', 'checksum', 'dimension', 'dependencies', 'selected_dimensions', 'vary_dimensions', 'source_ids', '_arena_source_ids']);
    const scrub = (item: any, key = ''): any => {
      if (typeof item === 'string') return identifiers.has(key) ? item
        : terms.reduce((text, term) => text.split(term).join(''), item);
      if (item === null || typeof item !== 'object') return item;
      if (Array.isArray(item)) return item.map(entry => scrub(entry, key));
      const affected = blocked.has(item.id) || [...(item.source_ids ?? []), ...(item._arena_source_ids ?? [])].some(id => blocked.has(id));
      // Integration providers are server enums; session providers remain untrusted declarations.
      const canonicalProvider = Array.isArray(item.capabilities) && typeof item.state === 'string' &&
        ['codex', 'chatgpt', 'user-export', 'social-native'].includes(item.provider);
      const result: Data = {};
      for (const [key, entry] of Object.entries(item)) {
        if (key === '_arena_source_ids' && !retainProvenance) continue;
        result[key] = key === 'provider' && canonicalProvider ? entry
          : affected && (sensitive.has(key) || key === 'author' && typeof entry === 'string') ? blank(entry) : scrub(entry, key);
      }
      if (affected) {
        result.redacted = true;
        if (Object.hasOwn(item, 'needs_review')) result.needs_review = true;
      }
      if (result.fields && result.artifacts) {
        for (const [dimension, artifact] of Object.entries(result.artifacts) as [string, Data][]) {
          if (!artifact.redacted) continue;
          result.fields[dimension] = '';
          if (Object.hasOwn(result.locks ?? {}, dimension)) result.locks[dimension] = '';
        }
      }
      return result;
    };
    return scrub(value);
  }

  private resultSources(workspace: string, input: Data, result: Data): string[] {
    let source_ids: string[] = [];
    if (result.artifact?.source_ids) source_ids.push(...result.artifact.source_ids);
    if (result.event?.source_ids) source_ids.push(...result.event.source_ids);
    if (result.revision_id) source_ids.push(...this.revisionSources(this.get('revision', workspace, result.revision_id)));
    if (result.profile_revision_id) source_ids.push(...this.get('profile_revision', workspace, result.profile_revision_id).source_ids);
    if (input.source_ids) source_ids.push(...input.source_ids);
    if (input.source_id) source_ids.push(input.source_id);
    return [...new Set(source_ids)];
  }

  private checkInputCredentials(value: any, workspace: string): void {
    const hashes = this.credentialHashes();
    const check = (item: unknown): void => {
      if (typeof item === 'string') this.assertNoCredential(item, workspace, hashes);
      else if (Array.isArray(item)) for (const entry of item) check(entry);
      else if (item && typeof item === 'object') for (const [key, entry] of Object.entries(item)) {
        this.assertNoCredential(key, workspace, hashes);
        check(entry);
      }
    };
    check(value);
  }

  private exportContext(workspace: string, input: Data): Data {
    this.requireText(input.revision_id, 'revision_id');
    const context = this.sanitize(this.readContext(workspace, input), workspace);
    context.rejections = context.decisions.filter((decision: Data) => decision.decision === 'rejected');
    const markdown = [`# ${context.exploration.title}`, context.exploration.objective,
      `Revisão: ${context.revision.id}`, ...dimensions.map(dimension => `## ${dimension}\n\n${context.revision.fields[dimension]}`),
      `## DNA desta produção\n\n${context.dna.text}`,
      '## Decisões e proveniência', JSON.stringify({ decisions: context.decisions, sources: context.sources }, null, 2)].join('\n\n');
    return { package: context, markdown, checksum: this.hash(this.canonical(context)) };
  }

  private readSource(workspace: string, input: Data): Data {
    const source = this.get('source', workspace, input.source_id);
    this.validateSourceIds(workspace, [source.id]);
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 2000;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.content.length || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) {
      this.invalid('Use offset válido e limit entre 1 e 10000 caracteres.');
    }
    const end = Math.min(source.content.length, offset + limit);
    return { ...this.sourceMetadata(source), content: source.content.slice(offset, end), next_offset: end < source.content.length ? end : null };
  }

  private validateVoice(value: unknown, partial: boolean): VoiceContent {
    const keys = ['identity', 'objectives', 'tone', 'vocabulary', 'positive_examples', 'negative_examples', 'rules'];
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) return this.invalid('Conteúdo do perfil inválido.');
    for (const [key, content] of Object.entries(value)) {
      if (!keys.includes(key) || !(typeof content === 'string' || Array.isArray(content) && content.every(item => typeof item === 'string'))) {
        this.invalid('O perfil aceita textos ou listas de textos nas dimensões de voz.');
      }
    }
    if (!partial && keys.some(key => !Object.hasOwn(value, key))) this.invalid('Preencha todas as dimensões do perfil de voz.');
    return { ...value } as VoiceContent;
  }

  private listProfiles(workspace: string): Data {
    const revisions = this.list('profile_revision', workspace);
    return { profiles: this.list('profile', workspace).map(profile => ({ ...profile,
      revisions: revisions.filter(revision => revision.profile_id === profile.id) })),
      proposals: this.list('profile_proposal', workspace), decisions: this.list('profile_decision', workspace) };
  }

  private proposeProfile(workspace: string, actor: Actor, input: Data): Data {
    const base = this.get('profile_revision', workspace, input.profile_revision_id);
    const profile = this.get('profile', workspace, base.profile_id);
    this.expectProfile(profile, input.expected_revision);
    if (base.id !== profile.current_revision_id) this.expectProfile(profile, base.id);
    const proposal: ProfileProposal = { id: randomUUID(), workspace_id: workspace, profile_id: profile.id,
      profile_revision_id: base.id, base_revision_id: base.id, version: 1, status: 'pending',
      changes: this.validateVoice(input.changes, true), source_ids: this.validateSourceIds(workspace, [...base.source_ids,
        ...this.validateSourceIds(workspace, input.evidence_source_ids)]),
      rationale: this.requireText(input.rationale, 'rationale'), author: actor, created_at: this.now() };
    this.insert('profile_proposal', proposal);
    return { proposal_id: proposal.id, version: 1, status: 'pending' };
  }

  private expectProfile(profile: Profile, expected: unknown): void {
    this.requireText(expected, 'expected_revision');
    if (profile.current_revision_id !== expected) throw new ArenaError('REVISION_CONFLICT', 'O perfil avançou.',
      { profile_id: profile.id, current_revision_id: profile.current_revision_id });
  }

  private approveProfile(workspace: string, actor: Actor, input: Data): Data {
    const proposal = this.get('profile_proposal', workspace, input.proposal_id);
    const profile = this.get('profile', workspace, proposal.profile_id);
    this.expectProfile(profile, input.expected_revision);
    if (proposal.base_revision_id !== profile.current_revision_id || input.presented_version !== proposal.version || proposal.status !== 'pending') {
      throw new ArenaError('REVISION_CONFLICT', 'Releia a proposta e a versão atual da voz antes de aprovar.');
    }
    const base = this.get('profile_revision', workspace, proposal.base_revision_id);
    const source_ids = this.validateSourceIds(workspace, [...base.source_ids, ...proposal.source_ids]);
    if (input.comment !== undefined && typeof input.comment !== 'string') this.invalid('comment deve ser texto.');
    const revision: ProfileRevision = { id: randomUUID(), workspace_id: workspace, profile_id: profile.id,
      version: base.version + 1, content: { ...base.content, ...proposal.changes }, source_ids,
      author: actor, created_at: this.now() };
    this.insert('profile_revision', revision);
    profile.current_revision_id = revision.id;
    this.update('profile', profile);
    proposal.status = 'accepted';
    this.update('profile_proposal', proposal);
    const decision: ProfileDecision = { id: randomUUID(), workspace_id: workspace, profile_id: profile.id,
      proposal_id: proposal.id, presented_version: proposal.version, decision: 'accepted', profile_revision_id: revision.id,
      source_ids, comment: input.comment ?? '', author: actor, created_at: this.now() };
    this.insert('profile_decision', decision);
    return { profile_revision_id: revision.id, decision_id: decision.id };
  }

  private editBranch(workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const previous = this.get('revision', workspace, branch.current_revision_id);
    const changes = this.validateChanges(input.changes);
    const dependencies = this.validateDependencies(input.dependencies, changes);
    const source_ids = this.validateSourceIds(workspace, this.inferredSources(previous, changes, dependencies, input.source_ids));
    const reason = this.requireText(input.reason, 'reason');
    const revision = this.changedRevision(previous, changes, dependencies, source_ids, actor);
    revision.reason = reason;
    this.commitRevision(branch, revision);
    return { revision_id: revision.id };
  }

  private changedRevision(previous: Revision, changes: DimensionText, dependencies: Dependencies, source_ids: string[], author: Actor): Revision {
    const revision: Revision = { ...previous, id: randomUUID(), parent_revision_id: previous.id,
      fields: { ...previous.fields, ...changes }, artifacts: structuredClone(previous.artifacts), author, created_at: this.now() };
    const changed = new Set(Object.keys(changes).filter(dimension => changes[dimension] !== previous.fields[dimension]));
    for (const [dimension, content] of Object.entries(changes)) {
      if (previous.locks[dimension] !== undefined && previous.locks[dimension] !== content) {
        throw new ArenaError('LOCK_VIOLATION', 'A alteração afeta uma dimensão travada.', { dimension });
      }
      revision.artifacts[dimension] = { content, dependencies: dependencies[dimension] ?? null,
        source_ids: this.inferredSources(previous, { [dimension]: content }, dependencies, source_ids),
        needs_review: false, input_revision_id: previous.id, author };
    }
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const [dimension, artifact] of Object.entries(revision.artifacts)) {
        if (Object.hasOwn(changes, dimension) || changed.has(dimension)) continue;
        if (changed.size && (artifact.dependencies === null || artifact.dependencies === undefined || artifact.dependencies.some((upstream: string) => changed.has(upstream)))) {
          artifact.needs_review = true;
          changed.add(dimension);
          expanded = true;
        }
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (dimension: string) => {
      if (visiting.has(dimension)) this.invalid('As dependências não podem conter ciclos.');
      if (visited.has(dimension)) return;
      visiting.add(dimension);
      for (const upstream of revision.artifacts[dimension]?.dependencies ?? []) visit(upstream);
      visiting.delete(dimension); visited.add(dimension);
    };
    for (const dimension of dimensions) visit(dimension);
    return revision;
  }

  private revisionSources(revision: Revision): string[] {
    const voice = revision.profile_revision_id ? this.get('profile_revision', revision.workspace_id, revision.profile_revision_id).source_ids : [];
    return [...new Set([...voice, ...Object.values(revision.artifacts ?? {}).flatMap(artifact => artifact.source_ids ?? [])])];
  }

  private inferredSources(base: Revision, changes: DimensionText, dependencies: Dependencies, direct: unknown): string[] {
    if (!Array.isArray(direct) || direct.some(id => typeof id !== 'string')) return this.invalid('source_ids deve ser uma lista de IDs.');
    const found = new Set<string>(direct);
    if (base.profile_revision_id) for (const id of this.get('profile_revision', base.workspace_id, base.profile_revision_id).source_ids) found.add(id);
    const visit = (dimension: string, visited: Set<string>) => {
      if (visited.has(dimension)) return;
      visited.add(dimension);
      const artifact = base.artifacts?.[dimension];
      for (const id of artifact?.source_ids ?? []) found.add(id);
      for (const upstream of artifact?.dependencies ?? []) visit(upstream, visited);
    };
    for (const dimension of Object.keys(changes)) {
      const upstream = dependencies[dimension];
      for (const sourceDimension of upstream ?? Object.keys(base.artifacts ?? {})) visit(sourceDimension, new Set());
    }
    return [...found];
  }

  private commitRevision(branch: Branch, revision: Revision): void {
    this.insert('revision', revision);
    branch.current_revision_id = revision.id;
    this.update('branch', branch);
  }

  private setLocks(workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const previous = this.get('revision', workspace, branch.current_revision_id);
    const revision = { ...previous, id: randomUUID(), parent_revision_id: previous.id,
      locks: this.validateLocks(input.locks, previous.fields), reason: this.requireText(input.reason, 'reason'),
      author: actor, created_at: this.now() };
    this.commitRevision(branch, revision);
    return { revision_id: revision.id };
  }

  private validateLocks(value: unknown, fields: DimensionText): DimensionText {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return this.invalid('Travas inválidas.');
    for (const [dimension, content] of Object.entries(value)) {
      if (!dimensions.includes(dimension as any) || typeof content !== 'string' || fields[dimension] !== content) {
        this.invalid('Uma trava deve preservar o valor aceito da dimensão.');
      }
    }
    return { ...value } as DimensionText;
  }

  private validateDimensions(value: unknown): string[] {
    if (!Array.isArray(value) || !value.length || value.some(dimension => !dimensions.includes(dimension)) || new Set(value).size !== value.length) {
      return this.invalid('Indique dimensões válidas sem duplicatas.');
    }
    return value;
  }

  private reviewArtifacts(workspace: string, actor: Actor, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    this.expectHead(branch, input.expected_revision);
    const previous = this.get('revision', workspace, branch.current_revision_id);
    const selected = this.validateDimensions(input.dimensions);
    const revision = { ...previous, id: randomUUID(), parent_revision_id: previous.id,
      artifacts: structuredClone(previous.artifacts), reason: this.requireText(input.reason, 'reason'), author: actor, created_at: this.now() };
    for (const dimension of selected) {
      const artifact = revision.artifacts[dimension];
      if (!artifact) this.invalid('A dimensão não possui artefato para revisar.');
      this.validateSourceIds(workspace, artifact.source_ids);
      for (const dependency of artifact.dependencies ?? []) {
        if (!selected.includes(dependency) && revision.artifacts[dependency]?.needs_review) {
          throw new ArenaError('STALE_DEPENDENCY', 'Revise também as entradas desatualizadas.', { dimension, dependency });
        }
      }
      artifact.needs_review = false;
      artifact.input_revision_id = previous.id;
      artifact.reviewed_by = actor;
    }
    this.commitRevision(branch, revision);
    return { revision_id: revision.id };
  }

  private exportText(workspace: string, input: Data): Data {
    const branch = this.get('branch', workspace, input.branch_id);
    const revision = this.get('revision', workspace, input.revision_id);
    if (revision.branch_id !== branch.id) this.notFound();
    for (const artifact of Object.values(revision.artifacts)) {
      this.validateSourceIds(workspace, artifact.source_ids);
      if (artifact.needs_review) throw new ArenaError('STALE_DEPENDENCY', 'Há artefatos que exigem revisão antes da exportação.');
    }
    if (!revision.artifacts.text) this.invalid('Ainda não há texto aceito para exportar.');
    return { text: revision.fields.text, status: 'exported', revision_id: revision.id };
  }

  private compareBranches(workspace: string, input: Data): Data {
    const leftBranch = this.get('branch', workspace, input.left_branch_id);
    const rightBranch = this.get('branch', workspace, input.right_branch_id);
    const left: Revision = this.sanitize(this.get('revision', workspace, input.left_revision_id), workspace);
    const right: Revision = this.sanitize(this.get('revision', workspace, input.right_revision_id), workspace);
    if (left.branch_id !== leftBranch.id || right.branch_id !== rightBranch.id) this.notFound();
    const ancestors = new Set<string>();
    let cursor: Revision | null = left;
    while (cursor) {
      ancestors.add(cursor.id);
      cursor = cursor.parent_revision_id ? this.get('revision', workspace, cursor.parent_revision_id) : null;
    }
    cursor = right;
    while (cursor && !ancestors.has(cursor.id)) cursor = cursor.parent_revision_id ? this.get('revision', workspace, cursor.parent_revision_id) : null;
    const summary = (revision: Revision) => ({ branch_id: revision.branch_id, revision_id: revision.id, fields: revision.fields });
    const criteria = input.criteria ?? ['clareza', 'adequação ao público', 'consistência de voz', 'suporte factual'];
    if (!Array.isArray(criteria) || criteria.some(item => typeof item !== 'string')) this.invalid('Critérios inválidos.');
    return { left: summary(left), right: summary(right), common_base: cursor ? { id: cursor.id, branch_id: cursor.branch_id } : null,
      differences: dimensions.filter(dimension => left.fields[dimension] !== right.fields[dimension])
        .map(dimension => ({ dimension, left: left.fields[dimension], right: right.fields[dimension] })),
      locks: { left: left.locks, right: right.locks }, needs_review: {
        left: Object.keys(left.artifacts).filter(dimension => left.artifacts[dimension].needs_review),
        right: Object.keys(right.artifacts).filter(dimension => right.artifacts[dimension].needs_review) }, criteria };
  }
  private validateDependencies(value: unknown, changes: DimensionText): Dependencies {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return this.invalid('Dependências inválidas.');
    for (const [dimension, upstream] of Object.entries(value)) {
      if (!Object.hasOwn(changes, dimension) || !Array.isArray(upstream) ||
        upstream.some(item => !dimensions.includes(item) || item === dimension)) this.invalid('Dependências inválidas.');
    }
    return { ...value } as Dependencies;
  }
  private validateSourceIds(workspace: string, value: unknown): string[] {
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string')) return this.invalid('source_ids deve ser uma lista de IDs.');
    for (const id of value) {
      const source = this.get('source', workspace, id);
      if (!this.sourcePermitted(source)) throw new ArenaError('SOURCE_UNAVAILABLE', 'Fonte indisponível ou sem permissão de uso.', { source_id: id });
    }
    return [...new Set(value)];
  }
  private expectHead(branch: Branch, expected: unknown): void {
    this.requireText(expected, 'expected_revision');
    if (branch.current_revision_id !== expected) this.conflict(branch, expected);
  }
  private conflict(branch: Branch, base: unknown): never {
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
      this.appendMutationEvent(operation, actor, workspace, input, result);
      const savedResult = { ...result };
      delete savedResult.token;
      this.db.prepare('INSERT INTO operations (workspace_id, actor_id, key, fingerprint, result) VALUES (?, ?, ?, ?, ?)')
        .run(workspace, actor.id, key, fingerprint, JSON.stringify({ ...savedResult,
          _arena_source_ids: this.resultSources(workspace, input, result) }));
      this.db.prepare('INSERT INTO audit_events (id, workspace_id, actor_id, operation, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), workspace, actor.id, operation, result.branch_id ?? result.exploration_id ?? null, this.now());
      return result;
    });
  }

  private appendMutationEvent(operation: string, actor: Actor, workspace: string, input: Data, result: Data): void {
    if (result.event_id) return;
    let branch_id = input.branch_id ?? result.branch_id;
    if (!branch_id && input.proposal_id) {
      const row = this.db.prepare("SELECT data FROM records WHERE id = ? AND workspace_id = ? AND type = 'proposal'").get(input.proposal_id, workspace);
      if (row) branch_id = JSON.parse(String(row.data)).branch_id;
    }
    if (!branch_id) return;
    const branch = this.get('branch', workspace, branch_id);
    const revision_id = result.revision_id ?? input.revision_id ?? input.base_revision_id ?? branch.current_revision_id;
    const revision = this.get('revision', workspace, revision_id);
    const source_ids = [...new Set((Object.values(revision.artifacts)).flatMap(artifact => artifact.source_ids ?? []))];
    const id = randomUUID();
    let session_id: string | null = null;
    if (result.proposal_id) {
      const row = this.db.prepare("SELECT data FROM records WHERE id = ? AND workspace_id = ? AND type = 'proposal'").get(result.proposal_id, workspace);
      if (row) session_id = JSON.parse(String(row.data)).session_id ?? null;
    }
    this.insert('event', { id, event_id: id, workspace_id: workspace, artifact_id: branch_id, branch_id,
      revision_id, type: operation.split('.')[1], operation, source_ids, session_id, author: actor, created_at: this.now(),
      references: Object.fromEntries(Object.entries(result).filter(([key]) => key.endsWith('_id') || ['version', 'status'].includes(key))),
      human_decision: operation === 'human.decide_proposal' ? input.decision : null });
  }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = action(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private get<T extends RecordType>(type: T, workspace: string, id: unknown): RecordRegistry[T] {
    if (typeof id !== 'string') this.invalid('Identificador obrigatório.');
    const row = this.db.prepare('SELECT data FROM records WHERE id = ? AND workspace_id = ? AND type = ?').get(id, workspace, type);
    if (!row) return this.notFound();
    return JSON.parse(String(row.data));
  }
  private list<T extends RecordType>(type: T, workspace: string): RecordRegistry[T][] {
    return this.db.prepare('SELECT data FROM records WHERE workspace_id = ? AND type = ? ORDER BY rowid').all(workspace, type)
      .map(row => JSON.parse(String(row.data)));
  }
  private insert<T extends RecordType>(type: T, record: RecordRegistry[T]): void {
    this.db.prepare('INSERT INTO records (id, workspace_id, type, data) VALUES (?, ?, ?, ?)')
      .run(record.id, record.workspace_id, type, JSON.stringify(record));
  }
  private update<T extends RecordType>(type: T, record: RecordRegistry[T]): void {
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
