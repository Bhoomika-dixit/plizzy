const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const roomId = '00000000-0000-4000-8000-000000000001';
const definition = {
  metadata: { title: "Arbitrary game" }, multiplayer: { version: 1, minPlayers: 2, maxPlayers: 4, objective: "cooperative", board: "shared", turns: "simultaneous", symbols: ["A", "B", "C", "D"] }, config: { seed: 1 }, state: { score: 0 },
  renderer: { id: 'grid.v1' }, assets: [],
  entities: [{ id: 'fish', state: {}, tags: [] }],
  interactions: [{ type: 'tap.v1', event: 'ENTITY_TAPPED', target: {} }],
  rules: [{ trigger: { event: 'ENTITY_TAPPED' }, effects: [{ type: 'ADD_SCORE', amount: 1 }] }],
  timer: null,
};

function load(file, imports) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => {
    if (name in imports) return imports[name];
    if (name.startsWith('.') || name.startsWith('@/')) return load((name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name)) + '.ts', {});
    return require(name);
  }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } }, Response, console, Date, structuredClone });
  return module.exports;
}
const runtime = load('agent-harness/runtime-v2.ts', {});
const behaviours = load('catalogue/entity-behaviours/runtime.ts', {});
const physicsRules = load('catalogue/rules/runtime.ts', {});
const sessions = load('agent-harness/multiplayer-runtime.ts', { './runtime-v2': runtime, '../catalogue/entity-behaviours/runtime': behaviours, '../catalogue/rules/runtime': physicsRules });

function setup({ user = 'host', member = true, round = null, count = 2, conflict = false, conflicts = 0, game = definition } = {}) {
  const db = { round, inserts: [] };
  const admin = {
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: user } : null } }) },
    from(table) {
      let operation = 'read', row, filters = {}, ordered = false;
      const query = {
        select() { return query; }, eq(key, value) { filters[key] = value; return query; }, order() { ordered = true; return query; },
        update(value) { operation = 'update'; row = value; return query; },
        insert(value) { operation = 'insert'; row = value; return query; },
        maybeSingle() { return query; }, single() { return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (operation !== 'read') {
              db.inserts.push({ table, row });
              if (table === 'multiplayer_rounds') {
                if (conflict) return { data: null, error: null };
                if (conflicts-- > 0) { db.round = {...db.round, revision:db.round.revision + 1}; return {data:null,error:null}; }
                db.round = row;
              }
              return { data: row, error: null };
            }
            if (table === 'rooms') return { data: { id: roomId, host_id: 'host' } };
            if (table === 'room_members') return { data: ordered ? Array.from({ length: count }, (_, i) => ({ user_id: i ? "friend" : "host" })) : member ? { user_id: user } : null, count };
            if (table === 'room_games') return { data: { game_version_id: 'version' } };
            if (table === 'game_versions') return { data: { definition:game, game_mode: 'multiplayer' } };
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
    '@/agent-harness/multiplayer-runtime': sessions,
  });
  return { db, request: (body, token = 'valid') => POST(new Request('http://localhost/api/multiplayer', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ roomId, ...body }) })) };
}
const activeRound = () => ({ room_id: roomId, game_version_id: 'version', revision: 3, updated_at: new Date().toISOString(), state: sessions.createSession(definition, ["host", "friend"], Date.now() - 10000) });

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
  round.state.session.clock = Date.now() - 3000;
  round.state.timerRunning = true;
  round.state.secondsRemaining = 10;
  const { request, db } = setup({ round });
  assert.equal((await request({ action: 'sync' })).status, 200);
  assert.equal(db.round.state.secondsRemaining, 7);
  assert.equal(db.round.revision, 4);
});

function fixture(options = {}) { return { ...definition, multiplayer: { ...definition.multiplayer, ...options } }; }
const start = (game, count = 3) => sessions.createSession(game, ['a','b','c','d'].slice(0, count), 0);
const tap = { type: 'ENTITY_TAPPED', entityId: 'fish' };
test('generic shared turns rotate among three players without title-based rules', () => {
  const game = fixture({ turns: 'round_robin', objective: 'competitive' });
  let state = start(game);
  assert.throws(() => sessions.moveSession(game, state, 'b', tap, 4000), /turn/);
  for (const [index, id] of ['a','b','c','a'].entries()) {
    state = sessions.moveSession(game, state, id, tap, 4000);
    assert.equal(state.values.score, index + 1);
  }
  assert.equal(state.session.players[0].score, 2);
});
test('individual competition isolates boards and only ends after every player finishes', () => {
  const game = { ...fixture({ board: 'individual', objective: 'competitive' }), rules: [{ ...definition.rules[0], effects: [{ type: 'ADD_SCORE', amount: 1 }, { type: 'END_GAME', outcome: 'win' }] }] };
  let state = start(game);
  state = sessions.moveSession(game, state, 'b', tap, 4000);
  assert.equal(state.session.boards.a.values.score, 0);
  assert.equal(state.session.boards.b.values.score, 1);
  assert.equal(state.status, 'playing');
  assert.throws(() => sessions.moveSession(game, state, 'b', tap, 4000), /finished/);
  state = sessions.moveSession(game, state, 'a', tap, 4000);
  state = sessions.moveSession(game, state, 'c', tap, 4000);
  assert.equal(state.status, 'finished');
  assert.equal(state.session.winners.length, 3);
});

test('shared timed rounds award cooperative wins and competitive rankings without a final player action', () => {
  const cooperative = {...fixture(),timer:{durationSeconds:1,startOnLoad:true},rules:[{trigger:{event:'TIMER_COMPLETED'},effects:[{type:'END_GAME',outcome:'win'}]}]};
  const ended = sessions.advanceSession(cooperative,start(cooperative),4100);
  assert.equal(ended.status,'finished');
  assert.deepEqual([...ended.session.winners],['a','b','c']);
  const competitive={...cooperative,multiplayer:{...cooperative.multiplayer,objective:'competitive'}};
  const state=start(competitive); state.session.players[1].score=5;
  assert.deepEqual([...sessions.advanceSession(competitive,state,4100).session.winners],['b']);
});
test('rosters, countdown, actor spoofing and illegal no-op actions are rejected', () => {
  const game = fixture(); const state = start(game);
  assert.throws(() => sessions.createSession(game, ['a']), /requires/);
  assert.throws(() => sessions.createSession(game, ['a','a']), /distinct/);
  assert.throws(() => sessions.moveSession(game, state, 'a', tap, 1000), /counting/);
  assert.throws(() => sessions.moveSession(game, state, 'outsider', tap, 4000), /watching/);
  assert.throws(() => sessions.moveSession(game, state, 'a', { ...tap, actorId: 'b' }, 4000), /Invalid/);
  assert.throws(() => sessions.moveSession(game, state, 'a', { type: 'TIMER_COMPLETED' }, 4000), /Unsupported/);
});
test('dynamic entity presentation and win conditions use trusted actor context', () => {
  const game = { ...fixture({ turns: 'round_robin', objective: 'competitive' }), entities: [{ ...definition.entities[0], content: { value: '□', stateKey: 'mark' }, behaviours: [], state: { mark: null } }], rules: [
    { trigger: { event: 'ENTITY_TAPPED' }, conditions: [{ left: { source: 'entity_state', entityId: '$event', key: 'mark' }, operator: 'falsy' }], effects: [{ type: 'SET_ENTITY_STATE', entityId: '$event', key: 'mark', value: { source: 'event', key: 'actorSymbol' } }] },
    { trigger: { event: 'STATE_CHANGED' }, conditions: [{ left: { source: 'entity_state', entityId: 'fish', key: 'mark' }, operator: 'eq', right: { source: 'event', key: 'actorSymbol' } }], effects: [{ type: 'END_GAME', outcome: 'win' }] },
  ] };
  const state = sessions.moveSession(game, start(game), 'a', tap, 4000);
  assert.equal(runtime.entityDisplay(game.entities[0], state.entities.fish), 'A');
  assert.equal(state.session.winners[0], 'a');
  assert.equal(state.status, 'finished');
});
test('each catalogue input reaches the same multiplayer reducer', () => {
  for (const [type,event,input] of [['tap.v1','ENTITY_TAPPED',{ entityId:'fish' }],['select.v1','ENTITY_SELECTED',{ entityId:'fish' }],['drag_drop.v1','ENTITY_DROPPED',{ entityId:'fish',targetEntityId:'fish' }],['text_input.v1','TEXT_SUBMITTED',{ text:'answer' }],['swipe.v1','SWIPED',{ direction:'left' }],['keyboard_move.v1','DIRECTION_PRESSED',{ direction:'up' }]]) {
    const game = { ...fixture(), interactions: [{ type, event, target:{} }], rules: [{ trigger:{event}, effects:[{type:'ADD_SCORE',amount:1}] }] };
    assert.equal(sessions.moveSession(game, start(game), 'b', {type:event,...input}, 4000).values.score, 1);
  }
});
test('side-scroller physics and results are calculated by server steps, never submitted scores', () => {
  const game = { ...fixture({board:'individual'}), renderer:{id:'side_scroller.v1',config:{gravity:58,impulse:-24}}, interactions:[{type:'impulse.v1',event:'IMPULSE',target:{}}], rules:[{ trigger:{event:'PLAYER_OUT_OF_BOUNDS'},effects:[{type:'END_GAME',outcome:'lose'}] }] };
  const state = sessions.moveSession(game, start(game), 'a', {type:'IMPULSE'}, 3100);
  assert.equal(state.session.inputs.a[0], 3100);
  const predicted = sessions.projectPhysicsBoard(game, state, 'a', 3100);
  assert.equal(predicted.physics.velocity, -24);
  assert.notEqual(state.session.physics.b.velocity, -24);
  const later = sessions.advanceSession(game, state, 13000);
  assert.equal(later.status, 'finished');
});

test('flying prediction reconciles delayed batched inputs without accepting scores, old times or reordered actions', () => {
  const game = { ...fixture({board:'individual'}), renderer:{id:'side_scroller.v1',config:{gravity:58,impulse:-24}}, interactions:[{type:'impulse.v1',event:'IMPULSE',target:{}}], rules:[{ trigger:{event:'PLAYER_OUT_OF_BOUNDS'},effects:[{type:'END_GAME',outcome:'lose'}] }] };
  const initial = start(game);
  const samples = [3300, 4100, 4900];
  const predicted = sessions.projectPhysicsBoard(game, initial, 'a', 5000, samples);
  let state = sessions.moveSession(game, initial, 'a', {type:'IMPULSE',samples}, 5200);
  assert.equal(state.session.physics.a.elapsed, 0, 'confirmed simulation waits for in-flight input');
  state = sessions.advanceSession(game, state, 5000 + sessions.PHYSICS_INPUT_WINDOW_MS);
  assert.ok(Math.abs(state.session.physics.a.y - predicted.physics.y) < 0.00001);
  assert.equal(state.session.boards.a.status, predicted.board.status);
  assert.equal(state.session.physics.b.elapsed < state.session.physics.a.elapsed, true, 'inactive player crashes independently');
  for (const input of [{type:'IMPULSE',samples:[4900]}, {type:'IMPULSE',samples:[12000]}, {type:'IMPULSE',samples:[5200,5100]}, {type:'IMPULSE',samples:'forged'}, {type:'IMPULSE',samples:[5100],score:1000}]) assert.throws(() => sessions.moveSession(game, state, 'a', input, 5100 + sessions.PHYSICS_INPUT_WINDOW_MS), /input|order|late/i);
  const replayed = sessions.moveSession(game, initial, 'a', {type:'IMPULSE',samples}, 5200);
  assert.equal(sessions.projectPhysicsBoard(game, replayed, 'a', 5000).physics.y, predicted.physics.y);
});

test('flying input survives competing heartbeat revisions and retries on the server without duplicating the batch', async () => {
  const game = { ...fixture({board:'individual'}), renderer:{id:'side_scroller.v1',config:{}}, interactions:[{type:'impulse.v1',event:'IMPULSE',target:{}}] };
  const state = sessions.createSession(game, ['host','friend'], Date.now()-3600);
  const round = {...activeRound(),state};
  const {request,db} = setup({game,round,conflicts:2});
  const samples = [Date.now()-200];
  const response = await request({action:'event',revision:0,event:{type:'IMPULSE',samples}});
  assert.equal(response.status,200);
  assert.equal(db.round.revision,6);
  assert.deepEqual([...db.round.state.session.inputs.host],samples);
  assert.equal(db.round.state.session.physics.friend.elapsed,0);
});

test('dynamic state labels do not expose the face of unrevealed catalogue cards', () => {
  for (const [behaviour,key] of [['flip.v1','faceUp'],['reveal.v1','revealed']]) {
    const entity={content:{value:'Visible',stateKey:'answer',backValue:'?'},behaviours:[{id:behaviour}]};
    assert.equal(runtime.entityDisplay(entity,{state:{[key]:false,answer:'Secret face'}}),'?');
    assert.equal(runtime.entityDisplay(entity,{state:{[key]:true,answer:'Secret face'}}),'Secret face');
  }
});

const { validateGameDefinitionV2 } = load('agent-harness/game-definition-v2.ts', {});
const texts = Object.fromEntries(['welcome.title','welcome.instructions','hud.scoreLabel','hud.timerLabel','result.winTitle','result.loseTitle','result.playAgain'].map(key => [key, key]));
function validDefinition(renderer) {
  return { ...fixture(), schemaVersion:2, metadata:{title:'Generic catalogue game',description:'Play',genre:'puzzle',launchMode:'multiplayer'},config:{mode:'multiplayer',seed:1,estimatedDurationMinutes:1}, renderer:{ id: renderer, config:{rows:2,columns:2,lanes:3}}, entities:[{id:'fish',type:'choice',label:'Choice',state:{mark:null},behaviours:[],content:{kind:'text',value:'Choose',stateKey:'mark'}}], interactions:[{id:'tap',type:'tap.v1',event:'ENTITY_TAPPED',target:{}}], rules:[{id:'finish',trigger:{event:'ENTITY_TAPPED'},effects:[{type:'END_GAME',outcome:'win',reasonTextKey:'result.winTitle'}]}],outcomes:{win:{textKey:'result.winTitle'}},texts,visuals:{backgroundColor:'#ffffff',cardColor:'#ffffff',textColor:'#112233',accentColor:'#7755ff'}};
}
test('all generic catalogue renderers validate and execute the same multiplayer definition', () => {
  for (const renderer of ['arena.v1','grid.v1','card_grid.v1','circles.v1','lanes.v1','scene.v1','list.v1']) {
    const game = validDefinition(renderer); const validated = validateGameDefinitionV2(game);
    assert.equal(validated.valid, true, validated.errors?.join(';'));
    assert.equal(sessions.moveSession(game, start(game), 'c', tap, 4000).status, 'finished');
  }
});
test('contracts reject unsupported capacities, mismatched modes and invalid dynamic displays', () => {
  const game = validDefinition('grid.v1');
  for (const broken of [{...game,multiplayer:undefined},{...game,multiplayer:{...game.multiplayer,maxPlayers:33}},{...game,metadata:{...game.metadata,launchMode:'single_player'}},{...game,entities:[{...game.entities[0],content:{...game.entities[0].content,stateKey:'not_initialized'}}]}]) assert.equal(validateGameDefinitionV2(broken).valid,false);
});
test('solo definitions still validate with the multiplayer contract absent', () => {
  const game = validDefinition('grid.v1');
  delete game.multiplayer; game.config.mode='single_player'; game.metadata.launchMode='single_player';
  assert.equal(validateGameDefinitionV2(game).valid, true);
});
