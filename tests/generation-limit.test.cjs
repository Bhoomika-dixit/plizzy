const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup({ user = 'verified-user', quotaError = false, quotaThrow = false, malformedQuota = false } = {}) {
  let used = 0, aiCalls = 0, traced = 0;
  const reservations = [];
  const reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
  const admin = {
    rpc: async (name, args) => {
      reservations.push({ name, args });
      if (quotaThrow) throw Error('Connection failed');
      if (quotaError) return { error: { code: 'missing_rpc' }, data: null };
      if (malformedQuota) return { error: null, data: [] };
      const allowed = used < 3;
      if (allowed) used++;
      return { error: null, data: [{ allowed, used, resets_at: reset.toISOString() }] };
    },
  };
  const authClient = { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) } };
  const module = { exports: {} };
  const imports = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@supabase/supabase-js': { createClient: (_url, key) => key === 'service' ? admin : authClient },
    '@/agent-harness/game-designer': { generateGameDefinition: async () => { aiCalls++; return { valid: false, errors: ['Fixture stops before persistence'] }; } },
    '@/agent-harness/observability': { startGameGenerationTrace: () => { traced++; return { completeAgent() {}, finish() {}, fail() {} }; } },
    '@/agent-harness/game-definition': {},
    '@/agent-harness/game-definition-v2': {},
    '@/agent-harness/cover-svg': {},
    '@/agent-harness/generated-asset-materializer': { materializeGeneratedAssets: () => assert.fail('Rejected generation must not create images') },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/generate-game/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => name in imports ? imports[name] : require(name), process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable', SUPABASE_SERVICE_ROLE_KEY: 'service' } }, Response, Date, console });
  return {
    post: (body = { title: 'Quiz', prompt: 'Make a quiz', mode: 'single_player' }, authorization = 'Bearer valid') => module.exports.POST(new Request('https://plizzy.test/api/generate-game', { method: 'POST', headers: { ...(authorization ? { authorization } : {}), 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })),
    counts: () => ({ used, aiCalls, traced, reservations }),
  };
}

test('solo and multiplayer share three admissions; fourth request never calls AI', async () => {
  const app = setup();
  for (const mode of ['single_player', 'multiplayer', 'single_player']) {
    assert.equal((await app.post({ title: 'Quiz', prompt: 'Idea', mode })).status, 422);
  }
  const blocked = await app.post();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
  assert.equal(blocked.headers.get('Cache-Control'), 'no-store');
  assert.equal((await blocked.json()).code, 'daily_generation_limit');
  assert.equal(app.counts().aiCalls, 3, 'Failed AI attempts still consume allowance');
  assert.equal(app.counts().traced, 3);
});

test('uses verified identity instead of a submitted user ID', async () => {
  const app = setup();
  await app.post({ title: 'Quiz', prompt: 'Idea', mode: 'multiplayer', userId: 'victim', usageDate: '2099-01-01' });
  assert.equal(app.counts().reservations[0].name, 'consume_game_generation');
  assert.deepEqual(JSON.parse(JSON.stringify(app.counts().reservations[0].args)), { p_user_id: 'verified-user' });
});

test('invalid and unauthenticated requests do not consume allowance', async () => {
  const app = setup();
  assert.equal((await app.post(undefined, '')).status, 401);
  for (const body of ['{', 'null', '[]', {}, { title: 'Quiz', prompt: 'Idea', mode: 'forged' }]) assert.equal((await app.post(body)).status, 400);
  assert.equal(app.counts().reservations.length, 0);
  const signedOut = setup({ user: null });
  assert.equal((await signedOut.post()).status, 401);
  assert.equal(signedOut.counts().reservations.length, 0);
});

test('quota errors and missing data fail closed before tracing or paid work', async () => {
  for (const options of [{ quotaError: true }, { quotaThrow: true }, { malformedQuota: true }]) {
    const app = setup(options);
    assert.equal((await app.post()).status, 503);
    assert.equal(app.counts().aiCalls, 0);
    assert.equal(app.counts().traced, 0);
  }
});

test('parallel endpoint requests still respect the atomic quota contract', async () => {
  const app = setup();
  const responses = await Promise.all(Array.from({ length: 15 }, () => app.post()));
  assert.equal(responses.filter(r => r.status === 422).length, 3);
  assert.equal(responses.filter(r => r.status === 429).length, 12);
  assert.equal(app.counts().aiCalls, 3);
});
