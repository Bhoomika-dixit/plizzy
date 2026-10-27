const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const roomId = '00000000-0000-4000-8000-000000000001';
const definition = {
  config: { seed: 1 }, state: { score: 0 },
  renderer: { id: 'grid.v1' }, assets: [],
  entities: [{ id: 'fish', state: {}, tags: [] }],
  interactions: [{ type: 'tap.v1', event: 'ENTITY_TAPPED', target: {} }],
  rules: [{ trigger: { event: 'ENTITY_TAPPED' }, effects: [{ type: 'ADD_SCORE', amount: 1 }] }],
  timer: null,
};

function load(file, imports) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => { if (!(name in imports)) throw Error(name); return imports[name]; }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } }, Response, console, Date });
  return module.exports;
}
const runtime = load('agent-harness/runtime-v2.ts', {});
const ticTacToe = load('lib/multiplayer/tic-tac-toe.ts', { '@/agent-harness/runtime-v2': runtime });

function setup({ user = 'host', member = true, round = null, count = 2, conflict = false } = {}) {
  const db = { round, inserts: [] };
  const admin = {
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: user } : null } }) },
    from(table) {
      let operation = 'read', row, filters = {};
      const query = {
        select() { return query; }, eq(key, value) { filters[key] = value; return query; }, order() { return query; },
        update(value) { operation = 'update'; row = value; return query; },
        insert(value) { operation = 'insert'; row = value; return query; },
        maybeSingle() { return query; }, single() { return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (operation !== 'read') {
              db.inserts.push({ table, row });
              if (table === 'multiplayer_rounds') { if (conflict) return { data: null, error: null }; db.round = row; }
              return { data: row, error: null };
            }
            if (table === 'rooms') return { data: { id: roomId, host_id: 'host' } };
            if (table === 'room_members') return { data: member ? { user_id: user } : null, count };
            if (table === 'room_games') return { data: { game_version_id: 'version' } };
            if (table === 'game_versions') return { data: { definition, game_mode: 'multiplayer' } };
            if (table === 'multiplayer_rounds') return { data: db.round, error: null };
            throw Error(table + JSON.stringify(filters));
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const { POST } = load('app/api/multiplayer/route.ts', {
    '@supabase/supabase-js': { createClient: () => admin },
    '@/agent-harness/game-definition-v2': { validateGameDefinitionV2: value => ({ valid: true, value }) },
    '@/agent-harness/runtime-v2': runtime,
    '@/lib/multiplayer/tic-tac-toe': ticTacToe,
  });
  return { db, request: (body, token = 'valid') => POST(new Request('http://localhost/api/multiplayer', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ roomId, ...body }) })) };
}
const activeRound = () => ({ room_id: roomId, game_version_id: 'version', revision: 3, updated_at: new Date().toISOString(), state: runtime.createRuntimeV2(definition) });

test('authentication and room membership protect the endpoint', async () => {
  assert.equal((await setup().request({ action: 'sync' }, 'invalid')).status, 401);
  assert.equal((await setup({ member: false }).request({ action: 'sync' })).status, 403);
});
test('room shelf metadata is available only to room members', async () => {
  assert.equal((await setup().request({ action: 'shelf' })).status, 200);
  assert.equal((await setup({ member: false }).request({ action: 'shelf' })).status, 403);
});
test('host starts a saved shared round, with at least two members', async () => {
  assert.equal((await setup({ count: 1 }).request({ action: 'start', versionId: 'version' })).status, 400);
  assert.equal((await setup({ user: 'friend' }).request({ action: 'start', versionId: 'version' })).status, 403);
  const { request, db } = setup();
  assert.equal((await request({ action: 'start', versionId: 'version' })).status, 200);
  assert.equal(db.round.revision, 0);
});
test('players change the shared score, while stale moves are rejected', async () => {
  const { request, db } = setup({ round: activeRound(), user: 'friend' });
  const response = await request({ action: 'event', revision: 3, event: { type: 'ENTITY_TAPPED', entityId: 'fish' } });
  assert.equal(response.status, 200);
  assert.equal(db.round.state.values.score, 1);
  assert.equal((await request({ action: 'event', revision: 3, event: { type: 'ENTITY_TAPPED', entityId: 'fish' } })).status, 409);
  assert.equal(db.round.state.values.score, 1);
});
test('internal events and forged score fields cannot be submitted', async () => {
  const { request } = setup({ round: activeRound() });
  for (const event of [{ type: 'GAME_STARTED' }, { type: 'TIMER_COMPLETED' }, { type: 'ENTITY_TAPPED', entityId: 'fish', score: 999 }, { type: 'ENTITY_TAPPED', entityId: 'missing' }]) {
    assert.equal((await request({ action: 'event', revision: 3, event })).status, 400);
  }
});
test('reconnect retrieves persisted state and concurrent writes return conflict', async () => {
  const { request } = setup({ round: activeRound() });
  assert.equal((await (await request({ action: 'sync' })).json()).round.revision, 3);
  const other = setup({ round: activeRound(), conflict: true });
  assert.equal((await other.request({ action: 'event', revision: 3, event: { type: 'ENTITY_TAPPED', entityId: 'fish' } })).status, 409);
});
test('joining again preserves existing membership rather than replacing its role', async () => {
  const { request, db } = setup();
  const response = await request({ action: 'join', code: 'invite' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).roomId, roomId);
  assert.equal(db.inserts.length, 0);
});
test('a reconnect catches up the shared timer from persisted server time', async () => {
  const round = activeRound();
  round.updated_at = new Date(Date.now() - 3000).toISOString();
  round.state.timerRunning = true;
  round.state.secondsRemaining = 10;
  const { request, db } = setup({ round });
  assert.equal((await request({ action: 'sync' })).status, 200);
  assert.equal(db.round.state.secondsRemaining, 7);
  assert.equal(db.round.revision, 4);
});

const ticDefinition = { ...definition, metadata: { title: 'Tic-Tac-Toe' }, renderer: { id: 'grid.v1', config: { rows: 3, columns: 3 } },
  rules: [], entities: Array.from({ length: 9 }, (_, index) => ({ id: `cell_${index}`, grid: { row: Math.floor(index / 3) + 1, column: index % 3 + 1 }, state: {} })) };
function ticStart() { return ticTacToe.createTicTacToe(ticDefinition, 'alice', 'bob'); }
function move(state, cell) { return ticTacToe.playTicTacToe(ticDefinition, state, state.values.turn === 'X' ? 'alice' : 'bob', `cell_${cell}`); }

test('tic-tac-toe assigns X/O and prevents spectators, repeated turns and overwrites', () => {
  let state = ticStart();
  assert.equal(state.values.turn, 'X');
  assert.throws(() => ticTacToe.playTicTacToe(ticDefinition, state, 'bob', 'cell_0'), /turn/);
  assert.throws(() => ticTacToe.playTicTacToe(ticDefinition, state, 'spectator', 'cell_0'), /turn/);
  state = move(state, 0);
  assert.equal(state.entities.cell_0.state.mark, 'X');
  assert.equal(state.values.turn, 'O');
  assert.throws(() => ticTacToe.playTicTacToe(ticDefinition, state, 'alice', 'cell_1'), /turn/);
  assert.throws(() => move(state, 0), /occupied/);
  assert.equal(state.values.moves, 1);
});
test('tic-tac-toe detects all eight winning lines and ends the round', () => {
  for (const line of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]) {
    const other = Array.from({ length: 9 }, (_, index) => index).filter((index) => !line.includes(index));
    let state = ticStart();
    for (const cell of [line[0],other[0],line[1],other[1],line[2]]) state = move(state, cell);
    assert.equal(state.values.winner, 'X');
    assert.equal(state.status, 'finished');
    assert.throws(() => move(state, other[2]), /finished/);
  }
});
test('tic-tac-toe supports O wins and draws, without the old cooperative timer', () => {
  let state = ticStart();
  assert.equal(state.timerRunning, false);
  for (const cell of [0,3,1,4,8,5]) state = move(state, cell);
  assert.equal(state.values.winner, 'O');
  state = ticStart();
  for (const cell of [0,1,2,4,3,5,7,6,8]) state = move(state, cell);
  assert.equal(state.values.winner, 'draw');
  assert.equal(state.status, 'finished');
  assert.equal(state.values.moves, 9);
});
