// Opt-in validation of actual model-generated versions; no user sessions are changed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  cache.set(file, module.exports);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, structuredClone, Date, require(name) {
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name) + '.ts');
    return require(name);
  } });
  cache.set(file, module.exports); return module.exports;
}
async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const runtime = load('agent-harness/multiplayer-runtime.ts');
  const { validateGameDefinitionV2 } = load('agent-harness/game-definition-v2.ts');
  for (const id of process.argv.slice(2)) {
    const { data, error } = await admin.from('game_versions').select('definition').eq('id', id).single();
    if (error) throw error;
    const parsed = validateGameDefinitionV2(data.definition);
    assert.ok(parsed.valid, JSON.stringify(parsed.errors));
    const game = parsed.value;
    const actors = Array.from({ length: game.multiplayer.minPlayers }, (_, index) => `actor_${index}`);
    let state = runtime.createSession(game, actors, 0);
    if (game.renderer.id === 'side_scroller.v1') {
      state = runtime.moveSession(game, state, actors[0], { type:'IMPULSE' }, 3100);
      state = runtime.advanceSession(game, state, 40000);
      assert.equal(state.status, 'finished');
    } else if (game.multiplayer.turns === 'round_robin' && game.renderer.config.rows === 3) {
      const cells = game.entities.filter(entity => entity.grid).sort((a,b) => (a.grid.row - b.grid.row) * 3 + a.grid.column - b.grid.column);
      const event = game.interactions.find(item => item.type === 'tap.v1' || item.type === 'select.v1').event;
      for (const [turn, cell] of [0,3,1,4,2].entries()) state = runtime.moveSession(game, state, actors[turn % 2], { type:event, entityId:cells[cell].id }, 4000);
      assert.equal(state.status, 'finished', 'Generated winning line must finish the game');
      assert.equal(state.session.winners[0], actors[0]);
    } else {
      state = runtime.advanceSession(game, state, 4000);
      const before = JSON.stringify(state.session.boards[actors[1]]);
      let moved = false;
      for (const entity of game.entities) {
        const interaction = game.interactions.find(item => item.type === 'tap.v1' || item.type === 'select.v1');
        if (!interaction) continue;
        try { state = runtime.moveSession(game, state, actors[0], { type:interaction.event, entityId:entity.id }, 4000); moved = true; break; } catch {}
      }
      assert.ok(moved, 'At least one generated action must execute');
      assert.equal(JSON.stringify(state.session.boards[actors[1]]), before, 'One player must not mutate another board');
    }
    console.log(JSON.stringify({ versionId:id, renderer:game.renderer.id, players:actors.length, objective:game.multiplayer.objective, state:state.status, passed:true }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
