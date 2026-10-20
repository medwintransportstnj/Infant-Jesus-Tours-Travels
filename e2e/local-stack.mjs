// Local stand-in for the Supabase API gateway, for end-to-end testing WITHOUT a cloud project.
//   /rest/v1/*    -> a real PostgREST in front of a real Postgres running the real migrations + RLS
//   /auth/v1/*    -> minimal password sign-in that issues JWTs PostgREST verifies (test accounts only)
//   /storage/v1/* -> in-memory object store that applies the same admin-only rule as the storage policies
//   /realtime/v1  -> postgres_changes emulator (e2e/realtime.mjs) that applies RLS per subscriber
// This file is test tooling and is never part of the production build.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { attachRealtime } from './realtime.mjs';

const SECRET = process.env.JWT_SECRET;
const POSTGREST = process.env.POSTGREST_URL ?? 'http://127.0.0.1:3001';
const PORT = Number(process.env.PORT ?? 54321);
const USERS = {
  'owner@test.local': { id: '00000000-0000-0000-0000-0000000000aa', password: 'correct-horse-battery' },
  'office@test.local': { id: '00000000-0000-0000-0000-0000000000cc', password: 'office-password-123' },
  'driver@test.local': { id: '00000000-0000-0000-0000-0000000000dd', password: 'driver-password-123' },
  'visitor@test.local': { id: '00000000-0000-0000-0000-0000000000bb', password: 'visitor-password-123' },
};
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function sign(claims) {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function verify(token) {
  try {
    const [h, p, s] = token.split('.');
    if (crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
    return JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch { return null; }
}
const objects = new Map();
// Preload generated fixture photos (e2e/fixture-images/<bucket>/<path>) so screenshots look realistic.
const FIXTURES = new URL('./fixture-images/', import.meta.url).pathname;
(function preload(dir) {
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) preload(full);
      else objects.set(relative(FIXTURES, full), { data: readFileSync(full), type: 'image/webp' });
    }
  } catch { /* no fixture images */ }
})(FIXTURES);
const refreshTokens = new Map();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const json = (res, status, body) => { res.writeHead(status, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const read = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

async function isAdmin(authorization) {
  const r = await fetch(`${POSTGREST}/rpc/is_admin`, { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: '{}' });
  return r.ok && (await r.json()) === true;
}

if (process.argv[2] === 'anon-key') { console.log(sign({ role: 'anon', iss: 'local', exp: 4102444800 })); process.exit(0); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const body = await read(req);
  try {
    if (url.pathname.startsWith('/rest/v1')) {
      const headers = { ...req.headers }; delete headers.host; delete headers['content-length']; delete headers.apikey;
      const r = await fetch(`${POSTGREST}${url.pathname.replace('/rest/v1', '') || '/'}${url.search}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const out = Buffer.from(await r.arrayBuffer());
      const h = { ...cors }; r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) h[k] = v; });
      res.writeHead(r.status, h); return res.end(out);
    }
    const session = (id, email) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const refresh = crypto.randomUUID(); refreshTokens.set(refresh, email);
      const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, identities: [{ id }], created_at: new Date().toISOString() };
      return { access_token: sign({ sub: id, role: 'authenticated', email, aud: 'authenticated', exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user };
    };
    if (url.pathname === '/auth/v1/token') {
      const input = JSON.parse(body.toString() || '{}');
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const email = refreshTokens.get(input.refresh_token);
        if (!email) return json(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' });
        return json(res, 200, session(USERS[email].id, email));
      }
      const email = String(input.email).toLowerCase();
      const u = USERS[email];
      if (!u || u.password !== input.password) return json(res, 400, { error: 'invalid_grant', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(res, 200, session(u.id, email));
    }
    if (url.pathname === '/auth/v1/signup') {
      const input = JSON.parse(body.toString() || '{}');
      const email = String(input.email).toLowerCase();
      if (USERS[email]) return json(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const id = crypto.randomUUID();
      // The real GoTrue writes auth.users; the profile row is then created by our own trigger.
      writeFileSync('/tmp/ijt-signup.sql', `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', $e$${email}$e$, $j$${JSON.stringify(input.data ?? {})}$j$::jsonb);`, { mode: 0o644 });
      execFileSync('su', ['postgres', '-c', `psql -v ON_ERROR_STOP=1 -q -d ${process.env.E2E_DB ?? 'ijt_e2e'} -f /tmp/ijt-signup.sql`]);
      USERS[email] = { id, password: input.password };
      return json(res, 200, session(id, email));
    }
    if (url.pathname === '/auth/v1/recover') return json(res, 200, {});
    if (url.pathname === '/auth/v1/user') {
      const claims = verify((req.headers.authorization ?? '').replace('Bearer ', ''));
      if (!claims?.sub) return json(res, 401, { msg: 'invalid JWT' });
      if (req.method === 'PUT') { const input = JSON.parse(body.toString() || '{}'); if (input.password && USERS[claims.email]) USERS[claims.email].password = input.password; }
      return json(res, 200, { id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email, app_metadata: {}, user_metadata: {} });
    }
    if (url.pathname === '/auth/v1/logout') { res.writeHead(204, cors); return res.end(); }
    if (url.pathname.startsWith('/storage/v1/object/public/')) {
      const o = objects.get(url.pathname.replace('/storage/v1/object/public/', ''));
      if (!o) { res.writeHead(404, cors); return res.end(); }
      res.writeHead(200, { ...cors, 'content-type': o.type }); return res.end(o.data);
    }
    if (url.pathname.startsWith('/storage/v1/object')) {
      if (!(await isAdmin(req.headers.authorization ?? ''))) return json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      if (req.method === 'POST') {
        const key = url.pathname.replace('/storage/v1/object/', '');
        const name = key.split('/').slice(1).join('/');
        if (!/^[a-z0-9][a-z0-9/_-]{0,120}\.(webp|jpg|jpeg|png)$/.test(name)) return json(res, 403, { statusCode: '403', message: 'name rejected by policy' });
        // supabase-js sends multipart form data; keep the file part.
        const boundary = (req.headers['content-type'] ?? '').split('boundary=')[1];
        let data = body, type = req.headers['content-type'] ?? 'application/octet-stream';
        if (boundary) {
          const marker = Buffer.from(`--${boundary}`);
          let pos = 0;
          while ((pos = body.indexOf(marker, pos)) !== -1) {
            const headEnd = body.indexOf('\r\n\r\n', pos);
            if (headEnd === -1) break;
            const head = body.subarray(pos, headEnd).toString();
            const next = body.indexOf(marker, headEnd);
            if (/filename=/.test(head)) { data = body.subarray(headEnd + 4, next - 2); type = head.match(/content-type:\s*(\S+)/i)?.[1] ?? type; break; }
            pos = headEnd;
          }
        }
        objects.set(key, { data, type });
        return json(res, 200, { Key: key, Id: crypto.randomUUID() });
      }
      if (req.method === 'DELETE') {
        const bucket = url.pathname.replace('/storage/v1/object/', '');
        const { prefixes = [] } = JSON.parse(body.toString() || '{}');
        prefixes.forEach((p) => objects.delete(`${bucket}/${p}`));
        return json(res, 200, prefixes.map((name) => ({ name })));
      }
    }
    json(res, 404, { message: 'not emulated' });
  } catch (err) { console.error(err); json(res, 500, { message: String(err) }); }
});
attachRealtime(server, {
  postgrest: POSTGREST, verify,
  dbUrl: process.env.REALTIME_DB_URL ?? `postgres://authenticator:authenticator@127.0.0.1:5432/${process.env.E2E_DB ?? 'ijt_e2e'}`,
  log: process.env.REALTIME_LOG ? (m) => console.log(`[realtime] ${m}`) : undefined,
});
server.listen(PORT, () => console.log(`local stack on :${PORT}`));
