import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arena } from './arena.js';
import { ArenaError } from './contracts.js';
import { createMcpHttpHandler, createMcpServer, type McpOptions } from './mcp.js';
import { startHttpServer } from './http.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

interface LocalConfig { format_version: 1; workspace_id: string; database_path: string; membership_revision: number }
const conversationalOperations = new Set([
  'arena.list_work', 'arena.read_context', 'arena.read_source', 'arena.compare_branches', 'arena.list_profiles',
  'arena.open_artifact', 'arena.read_events', 'arena.export_context', 'arena.get_operation',
  'human.list_sources', 'human.integration_status', 'human.decide_proposal', 'human.edit_branch', 'human.set_locks',
  'human.create_profile', 'human.approve_profile', 'human.import_sources', 'human.revoke_source', 'human.remove_source',
  'human.review_artifacts', 'human.export_text', 'human.record_artifact_interaction'
]);

function invalid(message: string): never { throw new ArenaError('INVALID_INPUT', message); }
function privateDirectory(path: string) {
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())) invalid('O diretório de dados precisa ser uma pasta privada real.');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}
function writePrivate(path: string, content: string, exclusive = false) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) invalid('Arquivos privados não podem ser links simbólicos.');
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600, flag: exclusive ? 'wx' : 'w' });
  chmodSync(path, 0o600);
}
function readPrivate(path: string): string {
  if (!existsSync(path)) throw new ArenaError('NOT_FOUND', 'Arquivo de configuração ou credencial não encontrado.', {}, false, 'Inicialize a Arena ou escolha o arquivo de agente correto.');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new ArenaError('ACCESS_DENIED',
    'O arquivo privado exige acesso somente pelo proprietário (modo 0600).');
  return readFileSync(path, 'utf8');
}
function parseArguments(args: string[]) {
  const command = args[0] ?? 'help';
  const flags = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!['--data-dir', '--workspace-name', '--owner-name', '--agent', '--name', '--port', '--operation', '--input-file'].includes(flag)
      || value === undefined || value.startsWith('--') || flags.has(flag)) invalid('Argumentos inválidos. Consulte o comando help.');
    flags.set(flag, value);
  }
  return { command, flags, directory: resolve(flags.get('--data-dir') ?? process.env.ARENA_DATA_DIR ?? join(homedir(), '.local', 'share', 'arena')) };
}

function loadConfig(directory: string): LocalConfig {
  let config: LocalConfig;
  try { config = JSON.parse(readPrivate(join(directory, 'arena.json'))); }
  catch (error) { if (error instanceof ArenaError) throw error; invalid('Configuração local inválida.'); }
  if (config.format_version !== 1 || typeof config.workspace_id !== 'string'
    || config.database_path !== join(directory, 'arena.sqlite') || !existsSync(config.database_path)
    || lstatSync(config.database_path).isSymbolicLink()) invalid('Configuração local inválida ou base indisponível.');
  return config;
}

function agentName(value: string): string {
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(value)) invalid('Use um nome de agente simples, como codex ou chatgpt.');
  return value;
}

function readInputFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) invalid('Arquivo de argumentos não encontrado.');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) invalid('Use um arquivo JSON regular de até 1 MiB.');
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); }
  catch { invalid('O arquivo de argumentos precisa conter JSON válido.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Os argumentos precisam ser um objeto JSON.');
  for (const key of ['actor', 'actor_id', 'kind', 'role', 'token', 'owner_token', 'agent_token', 'authorization']) {
    if (Object.hasOwn(value, key)) invalid('Identidade e credenciais não podem ser fornecidas como argumentos.');
  }
  return value as Record<string, unknown>;
}

function withoutCredentials(value: unknown, ownerToken: string): unknown {
  if (typeof value === 'string') return ownerToken ? value.replaceAll(ownerToken, '[REDACTED]') : value;
  if (Array.isArray(value)) return value.map(item => withoutCredentials(item, ownerToken));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(?:token|owner_token|agent_token|token_hash|password|credentials|api_key|authorization)$/i.test(key))
    .map(([key, item]) => [key, withoutCredentials(item, ownerToken)]));
  return value;
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const { command, flags, directory } = parseArguments(args);
  if (command === 'help') {
    process.stdout.write('Arena: init | serve | mcp | agent --name codex|chatgpt | call --operation OP --input-file JSON\nOpções: --data-dir CAMINHO, --port PORTA, --agent NOME.\n');
    return;
  }
  if (command === 'init') {
    privateDirectory(directory);
    const databasePath = join(directory, 'arena.sqlite');
    if (['arena.json', 'arena.sqlite', 'owner.token', 'agent.token'].some(name => existsSync(join(directory, name)))) {
      throw new ArenaError('ACCESS_DENIED', 'Este diretório já contém uma Arena. A inicialização não redefine credenciais.');
    }
    const arena = new Arena(databasePath);
    chmodSync(databasePath, 0o600);
    try {
      const credentials = arena.bootstrap({ workspace_name: flags.get('--workspace-name') ?? 'Oficina local',
        owner_name: flags.get('--owner-name') ?? 'Proprietário local' });
      writePrivate(join(directory, 'owner.token'), `${credentials.owner_token}\n`, true);
      writePrivate(join(directory, 'agent.token'), `${credentials.agent_token}\n`, true);
      const config: LocalConfig = { format_version: 1, workspace_id: credentials.workspace_id, database_path: databasePath, membership_revision: 1 };
      writePrivate(join(directory, 'arena.json'), `${JSON.stringify(config, null, 2)}\n`, true);
      process.stdout.write(`Arena inicializada em ${directory}.\nCredencial humana: ${join(directory, 'owner.token')}\nCredencial do agente: ${join(directory, 'agent.token')}\n`);
    } finally {
      arena.close();
      for (const suffix of ['-wal', '-shm']) if (existsSync(databasePath + suffix)) chmodSync(databasePath + suffix, 0o600);
    }
    return;
  }
  if (command === 'mcp') {
    const config = loadConfig(directory);
    const tokenPath = process.env.ARENA_AGENT_TOKEN_FILE
      ?? (flags.has('--agent') ? join(directory, 'agents', `${agentName(flags.get('--agent')!)}.token`) : join(directory, 'agent.token'));
    const token = readPrivate(resolve(tokenPath)).trim();
    const arena = new Arena(config.database_path);
    try {
      const server = createMcpServer(arena, token, { workspace_id: config.workspace_id,
        viewer_url: process.env.ARENA_VIEWER_URL ?? 'http://127.0.0.1:8787/' });
      let closed = false;
      const close = async () => { if (!closed) { closed = true; await server.close(); arena.close(); } };
      process.once('SIGTERM', () => { void close(); });
      process.once('SIGINT', () => { void close(); });
      process.stdin.once('end', () => { void close(); });
      await server.connect(new StdioServerTransport());
    } catch (error) { arena.close(); throw error; }
    return;
  }
  if (command === 'serve') {
    const config = loadConfig(directory);
    const port = flags.has('--port') ? Number(flags.get('--port')) : 8787;
    if (!Number.isInteger(port) || port < 0 || port > 65_535) invalid('Porta inválida. Use um inteiro entre 0 e 65535.');
    const arena = new Arena(config.database_path);
    try {
      const options: McpOptions = { workspace_id: config.workspace_id };
      const local = await startHttpServer({ arena, workspace_id: config.workspace_id, port,
        mcpHandler: createMcpHttpHandler(arena, options) });
      options.viewer_url = local.url;
      let closed = false;
      const close = async () => { if (!closed) { closed = true; await local.close(); arena.close(); } };
      process.once('SIGTERM', () => { void close(); });
      process.once('SIGINT', () => { void close(); });
      process.stdout.write(`Arena local: ${local.url}\nCredencial humana: ${join(directory, 'owner.token')}\n`);
    } catch (error) { arena.close(); throw error; }
    return;
  }
  if (command === 'agent') {
    const config = loadConfig(directory);
    const name = agentName(flags.get('--name') ?? invalid('Informe --name codex ou --name chatgpt.'));
    const agentsDirectory = join(directory, 'agents');
    privateDirectory(agentsDirectory);
    const path = join(agentsDirectory, `${name}.token`);
    if (existsSync(path)) throw new ArenaError('ACCESS_DENIED', 'Este agente já possui um arquivo de credencial. Não será redefinido.');
    const ownerToken = readPrivate(join(directory, 'owner.token')).trim();
    const arena = new Arena(config.database_path);
    try {
      const owner = arena.authenticate(ownerToken);
      if (owner.kind !== 'human') throw new ArenaError('ACCESS_DENIED', 'O setup exige a credencial humana local.');
      const state = arena.execute('arena.list_work', owner, { workspace_id: config.workspace_id });
      const invited = arena.execute('human.invite_member', owner, {
        workspace_id: config.workspace_id, name, kind: 'agent', role: 'editor',
        expected_revision: state.membership_revision, idempotency_key: `cli-agent:${name}`
      });
      if (typeof invited.token !== 'string' || !invited.token) throw new ArenaError('CAPABILITY_UNAVAILABLE',
        'A credencial de uma operação anterior não pode ser reexibida.', {}, false,
        'Revogue a identidade incompleta no visualizador e provisione um novo nome de agente.');
      writePrivate(path, `${invited.token}\n`, true);
      config.membership_revision = invited.workspace_revision;
      writePrivate(join(directory, 'arena.json'), `${JSON.stringify(config, null, 2)}\n`);
      process.stdout.write(`Agente ${name} provisionado. Credencial privada: ${path}\n`);
    } finally { arena.close(); }
    return;
  }
  if (command === 'call') {
    const operation = flags.get('--operation') ?? invalid('Informe --operation e --input-file.');
    if (!conversationalOperations.has(operation)) throw new ArenaError('ACCESS_DENIED',
      'Operação indisponível no canal editorial local.', {}, false, 'Use apenas leituras de artefato ou decisões editoriais autorizadas.');
    const input = readInputFile(resolve(flags.get('--input-file') ?? invalid('Informe --input-file com os argumentos concretos.')));
    const config = loadConfig(directory);
    if (input.workspace_id !== undefined && input.workspace_id !== config.workspace_id) throw new ArenaError('ACCESS_DENIED', 'Workspace fora da configuração local.');
    // This channel reads its own human credential; the MCP agent credential is never a fallback.
    const ownerToken = readPrivate(resolve(process.env.ARENA_OWNER_TOKEN_FILE ?? join(directory, 'owner.token'))).trim();
    const arena = new Arena(config.database_path);
    try {
      const owner = arena.authenticate(ownerToken);
      if (owner.kind !== 'human') throw new ArenaError('ACCESS_DENIED', 'O comando editorial exige uma credencial humana independente.');
      const result = arena.execute(operation, owner, { ...input, workspace_id: config.workspace_id });
      process.stdout.write(`${JSON.stringify(withoutCredentials(result, ownerToken))}\n`);
    } catch (error) {
      if (error instanceof ArenaError) {
        process.stderr.write(`${JSON.stringify({ error: withoutCredentials(error.toJSON(), ownerToken) })}\n`);
        process.exitCode = 1;
      } else throw error;
    } finally { arena.close(); }
    return;
  }
  invalid('Comando desconhecido ou indisponível. Consulte help.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch(error => {
    const failure = error instanceof ArenaError ? error : new ArenaError('CAPABILITY_UNAVAILABLE',
      'Não foi possível concluir o comando local.', {}, false, 'Confira os caminhos e permissões; use suas credenciais existentes.');
    process.stderr.write(`${JSON.stringify({ error: failure.toJSON() })}\n`);
    process.exitCode = 1;
  });
}
