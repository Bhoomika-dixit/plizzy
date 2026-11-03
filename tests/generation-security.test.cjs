const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => name in imports ? imports[name] : require(name),
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable', SUPABASE_SERVICE_ROLE_KEY: 'server' } }, Buffer, Response });
  return module.exports;
}

test('successful generation persists the verified owner and uploads escaped SVG', async () => {
  const writes = [], uploads = [], sequence = [];
  const definition = {
    metadata: { description: 'Security fixture' }, config: { estimatedDurationMinutes: 1 },
    entities: [{ content: { kind: 'text', value: '</text><script>alert(1)</script>' } }],
    visuals: { backgroundColor: '#ffffff', accentColor: '#7766ff', textColor: '#111111' },
  };
  const admin = {
    rpc: async (name, args) => { sequence.push(name); assert.equal(args.p_user_id, 'verified-user'); return { data: [{ allowed: true, used: 1, resets_at: '2099-01-01T00:00:00Z' }], error: null }; },
    from: table => ({
      insert: value => {
        writes.push({ table, value });
        return { error: null, select: () => ({ single: async () => ({ data: { id: value.id }, error: null }) }) };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async value => { writes.push({ table, value }); return { error: null }; },
    }),
    storage: {
      createBucket: async () => ({ error: null }),
      from: () => ({ upload: async (path, data, options) => { uploads.push({ path, svg: data.toString(), options }); return { error: null }; } }),
    },
  };
  const trace = Object.fromEntries(['completeAgent', 'recordPersistenceStage', 'recordPersistence', 'finish', 'fail'].map(name => [name, () => {}]));
  const route = load('app/api/generate-game/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@supabase/supabase-js': { createClient: (_url, key) => key === 'server' ? admin : { auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } } }) } } },
    '@/agent-harness/game-designer': { generateGameDefinition: async () => { sequence.push('AI'); return { valid: true, definition, toolsUsed: [], requirementContract: { requirementId: 'fixture', requirementVersion: 1 } }; } },
    '@/agent-harness/game-definition-v2': { gameRulesMarkdownV2: () => 'Fixture rules' },
    '@/agent-harness/generated-asset-materializer': { materializeGeneratedAssets: async () => ({ definition, records: [] }), saveGeneratedAssetRecords: async () => {} },
    '@/agent-harness/observability': { startGameGenerationTrace: () => trace },
    '@/agent-harness/cover-svg': load('agent-harness/cover-svg.ts'),
  });
  const response = await route.POST(new Request('https://plizzy.test/api/generate-game', {
    method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'A & B', prompt: 'Fixture', mode: 'single_player', userId: 'victim', creator_id: 'victim' }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(sequence, ['consume_game_generation', 'AI']);
  assert.equal(writes.find(w => w.table === 'games').value.creator_id, 'verified-user');
  assert.equal(writes.find(w => w.table === 'user_games').value.user_id, 'verified-user');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].path, `games/${result.gameId}/versions/${result.versionId}/cover.svg`);
  assert.equal(uploads[0].options.contentType, 'image/svg+xml');
  assert.ok(uploads[0].svg.includes('A &amp; B</text>'));
  assert.ok(uploads[0].svg.includes('&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.doesNotMatch(uploads[0].svg, /<script/i);
});
