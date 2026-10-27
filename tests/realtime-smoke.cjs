// Opt-in live transport test: node --env-file=.env tests/realtime-smoke.cjs VERSION_UUID
// Creates and removes an isolated test room. Never modifies an existing round.
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

async function main() {
  const versionId = process.argv[2];
  assert.match(versionId ?? '', /^[0-9a-f-]{36}$/i, 'Supply a game version UUID explicitly');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, 'Supabase server configuration is required');
  const clients = [0, 1].map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  const admin = clients[0];
  const roomId = randomUUID();
  const channels = [];
  let created = false;
  try {
    const { data: version, error: versionError } = await admin.from('game_versions').select('game_id').eq('id', versionId).single();
    if (versionError) throw versionError;
    const { data: game, error: gameError } = await admin.from('games').select('creator_id').eq('id', version.game_id).single();
    if (gameError) throw gameError;
    const { error: roomError } = await admin.from('rooms').insert({ id: roomId, host_id: game.creator_id, name: 'Temporary realtime smoke test', invite_code: randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase() });
    if (roomError) throw roomError;
    created = true;
    const received = clients.map(() => []);
    await Promise.all(clients.map((client, index) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Realtime subscription timed out')), 15000);
      const channel = client.channel(`smoke:${roomId}:${index}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_rounds', filter: `room_id=eq.${roomId}` }, payload => received[index].push({ revision: payload.new.revision, at: Date.now() }))
        .subscribe(status => {
          if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timeout); reject(Error(`Subscription failed: ${status}`)); }
        });
      channels.push({ client, channel });
    })));
    const { error: insertError } = await admin.from('multiplayer_rounds').insert({ room_id: roomId, game_version_id: versionId, state: { smokeTest: true }, revision: 0 });
    if (insertError) throw insertError;
    const started = Date.now();
    const { error: updateError } = await admin.from('multiplayer_rounds').update({ revision: 1, state: { smokeTest: true, move: 1 } }).eq('room_id', roomId);
    if (updateError) throw updateError;
    const deadline = Date.now() + 10000;
    while (!received.every(events => events.some(event => event.revision === 1)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(received.every(events => events.some(event => event.revision === 1)), 'Both WebSocket clients must receive the committed update');
    console.log(JSON.stringify({ websocketClients: 2, receivedCommittedRevision: 1, endToEndMilliseconds: received.map(events => events.find(event => event.revision === 1).at - started) }));
  } finally {
    await Promise.all(channels.map(({ client, channel }) => client.removeChannel(channel)));
    await Promise.all(clients.map(client => client.realtime.disconnect()));
    if (created) {
      const { error } = await admin.from('rooms').delete().eq('id', roomId);
      if (error) throw Error(`Could not remove isolated test room: ${error.message}`);
      console.log('Temporary room and round removed.');
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
