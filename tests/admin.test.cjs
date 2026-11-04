const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const email = 'bhoomika@plizzy.in';
const id = 'b347bfa2-a36a-41fe-a16a-5b1384ccdd3e';
const session = '3e9ac3f0-1d36-4822-b682-263c3ea63345';
function setup(options = {}) {
  const calls = [];
  const user = options.user === undefined ? { id, email, email_confirmed_at: '2026-11-04' } : options.user;
  const client = {
    auth: { getUser: async token => { calls.push({ auth: token }); return { data: { user }, error: options.authError }; }, getClaims: async () => ({ data: { claims: options.claims ?? { sub: id, session_id: session, amr: [{ method: 'otp' }] } }, error: options.claimsError }) },
    rpc: async (name, args) => { calls.push({ name, args }); if (options.throw) throw Error('sensitive provider detail'); return { data: options.empty ? null : { totals: { users: 3 } }, error: options.rpcError }; },
  };
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync('app/api/admin/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, Response, URL, console, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://prod.test', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' } }, require: name => ({ '@supabase/supabase-js': { createClient: () => client }, '@/lib/admin/types': { SUPERUSER_EMAIL: email } })[name] });
  return { calls, get: (query = '', token = 'Bearer verified-token') => module.exports.GET(new Request('https://admin.plizzy.in/api/admin' + query, { headers: token ? { Authorization: token } : {} })) };
}
test('admin reports require a live authenticated user; anonymous and forged tokens never reach reporting', async () => {
  const anonymous = setup(); assert.equal((await anonymous.get('', '')).status, 401); assert.equal(anonymous.calls.length, 0);
  const invalid = setup({ user: null, authError: {} }); assert.equal((await invalid.get()).status, 401); assert.equal(invalid.calls.filter(c => c.name).length, 0);
  assert.equal((await setup().get('', 'Basic token')).status, 401);
});
test('ordinary users and user-editable admin metadata cannot read global production data', async () => {
  for (const user of [{ id, email: 'player@example.test', email_confirmed_at: 'today', user_metadata: { role: 'superuser', email } }, { id, email, email_confirmed_at: null }]) {
    const app = setup({ user }); const response = await app.get(); assert.equal(response.status, 403); assert.equal(app.calls.filter(c => c.name).length, 0);
  }
});
test('a verified email alone is insufficient without a verified OTP session', async () => {
  for (const claims of [{ sub: id, session_id: session, amr: [{ method: 'password' }] }, { sub: 'other-user', session_id: session, amr: [{ method: 'otp' }] }, { sub: id, amr: [{ method: 'otp' }] }, { sub: id, session_id: session, amr: ['otp'] }]) {
    const app = setup({ claims }); assert.equal((await app.get()).status, 401); assert.equal(app.calls.filter(c => c.name).length, 0);
  }
});
test('only verified identity/session reach the server-only RPC, with bounded report filters', async () => {
  const app = setup(); const response = await app.get('?days=7&page=2&q=alice&sort=games&actor=attacker&session_id=forged');
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0'); assert.equal(response.headers.get('Vary'), 'Authorization');
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find(c => c.name))), { name: 'admin_dashboard_snapshot', args: { p_actor_id: id, p_session_id: session, p_days: 7, p_page: 2, p_query: 'alice', p_sort: 'games', p_user_id: null } });
  for (const query of ['?days=365','?page=0','?page=1.1','?page=100001','?sort=delete','?user=bad-id','?q='+'a'.repeat(101)]) assert.equal((await setup().get(query)).status, 400);
});
test('database authorization errors fail closed; provider diagnostics never reach the browser', async () => {
  const denied = await setup({ rpcError: { code: '42501', message: 'private table details' } }).get(); assert.equal(denied.status, 403); assert.ok(!(await denied.text()).includes('private table'));
  for (const options of [{ throw: true }, { empty: true }, { rpcError: { code: 'other', message: 'secret detail' } }]) { const r = await setup(options).get(); assert.equal(r.status, 503); assert.ok(!(await r.text()).includes('detail')); }
});
