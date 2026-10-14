import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ArenaError, agentOperations, humanOperations, type ArenaService } from './contracts.js';

type Options = { arena: ArenaService; workspace_id: string; port?: number;
  mcpHandler?: (request: IncomingMessage, response: ServerResponse) => Promise<void> };
const publicOperations = new Set<string>([...agentOperations, ...humanOperations]);
const webRoot = fileURLToPath(new URL('../web/', import.meta.url));

/** Independent loopback human channel. It never gives its credential to the MCP widget. */
export async function startHttpServer({ arena, workspace_id, port = 8787, mcpHandler }: Options) {
  const sessions = new Map<string, string>();
  let url = '';
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status: number, value: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
    try {
      if (request.headers.host !== new URL(url).host) return json(403, { code: 'ACCESS_DENIED', message: 'Host inválido.' });
      const path = new URL(request.url ?? '/', url).pathname;
      if (path === '/mcp' && mcpHandler) { await mcpHandler(request, response); return; }
      if (request.method === 'POST' && request.headers.origin !== url) return json(403, { code: 'ACCESS_DENIED', message: 'Origem inválida.' });
      if (path === '/api/login' && request.method === 'POST') {
        const input = await readJson(request);
        const actor = arena.authenticate(input.token);
        if (actor.kind !== 'human') return json(403, { code: 'ACCESS_DENIED', message: 'Use a credencial humana local.' });
        arena.execute('arena.list_work', actor, { workspace_id });
        const session = randomBytes(32).toString('base64url');
        sessions.set(session, input.token);
        response.setHeader('Set-Cookie', `arena_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
        return json(200, { actor, workspace_id });
      }
      if (path.startsWith('/api/')) {
        const session = (request.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith('arena_session='))?.slice(14);
        const token = session ? sessions.get(session) : undefined;
        if (!token) return json(401, { code: 'ACCESS_DENIED', message: 'Entre com sua credencial humana.' });
        // Reauthenticate and reauthorize on every request: revocation is effective immediately.
        const actor = arena.authenticate(token);
        if (actor.kind !== 'human') return json(403, { code: 'ACCESS_DENIED', message: 'Sessão humana obrigatória.' });
        arena.execute('arena.list_work', actor, { workspace_id });
        if (path === '/api/session' && request.method === 'GET') return json(200, { actor, workspace_id });
        if (path === '/api/logout' && request.method === 'POST') {
          sessions.delete(session!); response.setHeader('Set-Cookie', 'arena_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
          return json(200, { logged_out: true });
        }
        if (path === '/api/call' && request.method === 'POST') {
          const input = await readJson(request);
          if (!publicOperations.has(input.operation) || !input.input || typeof input.input !== 'object' || Array.isArray(input.input)) throw new ArenaError('INVALID_INPUT', 'Operação ou argumentos inválidos.');
          if (input.input.workspace_id !== undefined && input.input.workspace_id !== workspace_id) throw new ArenaError('ACCESS_DENIED', 'Workspace fora da sessão.');
          return json(200, arena.execute(input.operation, actor, { ...input.input, workspace_id }));
        }
        return json(404, { code: 'NOT_FOUND', message: 'Rota não encontrada.' });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { code: 'INVALID_INPUT', message: 'Método indisponível.' });
      const asset = ({ '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/parse-export.js': ['parse-export.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] } as Record<string, string[]>)[path];
      if (!asset) return json(404, { code: 'NOT_FOUND', message: 'Rota não encontrada.' });
      const content = await readFile(`${webRoot}${asset[0]}`);
      response.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      if (error instanceof ArenaError) return json(error.code === 'ACCESS_DENIED' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'REVISION_CONFLICT' || error.code === 'LOCK_VIOLATION' ? 409 : 400, error.toJSON());
      return json(500, { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Endereço local indisponível.');
  url = `http://127.0.0.1:${address.port}`;
  return { server, url, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); sessions.clear(); }) };
}

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ArenaError('INVALID_INPUT', 'Envie application/json.');
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new ArenaError('INVALID_INPUT', 'Corpo excede o limite de 1 MiB.');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ArenaError('INVALID_INPUT', 'JSON inválido.'); }
}
