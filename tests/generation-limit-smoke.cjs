// Opt-in: node --env-file=.env tests/generation-limit-smoke.cjs
// Real database concurrency/permissions checks; no emails or paid model calls.
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key && service);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, service, options);
  const anonymous = createClient(url, key, options);
  const player = createClient(url, key, options);
  const ids = [];
  try {
    for (let i = 0; i < 2; i++) {
      const { data, error } = await admin.auth.admin.createUser({ email: `plizzy-quota-${randomUUID()}@example.com`, email_confirm: true });
      assert.equal(error, null, 'Fixture creation');
      ids.push(data.user.id);
    }
    const reserve = async id => {
      const { data, error } = await admin.rpc('consume_game_generation', { p_user_id: id });
      assert.equal(error, null, 'Reservation must succeed');
      return data[0];
    };
    const first = await reserve(ids[0]);
    assert.equal(first.allowed, true);
    assert.equal(first.used, 1);
    assert.match(first.resets_at, /T00:00:00(?:\.\d+)?\+00:00$|T00:00:00(?:\.\d+)?Z$/);
    const yesterday = new Date(Date.parse(first.resets_at) - 2 * 86400000).toISOString().slice(0, 10);
    const { error: seedError } = await admin.from('game_generation_usage').insert({ user_id: ids[0], usage_date: yesterday, attempts: 3 });
    assert.equal(seedError, null);
    const results = await Promise.all(Array.from({ length: 20 }, () => reserve(ids[0])));
    assert.equal(results.filter(r => r.allowed).length, 2, 'Exactly two more concurrent admissions');
    assert.ok(results.every(r => r.used <= 3));
    assert.equal((await reserve(ids[1])).used, 1, 'Independent user allowance');
    const { data: rows, error: readError } = await admin.from('game_generation_usage').select('usage_date, attempts').eq('user_id', ids[0]);
    assert.equal(readError, null);
    assert.equal(rows.length, 2, 'UTC days have separate counters');
    assert.ok(rows.every(r => r.attempts === 3));
    const { data: generated, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: (await admin.auth.admin.getUserById(ids[0])).data.user.email });
    assert.equal(linkError, null);
    const { data: signedIn, error: verifyError } = await player.auth.verifyOtp({ email: generated.user.email, token: generated.properties.email_otp, type: 'email' });
    assert.equal(verifyError, null);
    if (process.argv.includes('--http')) {
      const response = await fetch('http://127.0.0.1:3000/api/generate-game', {
        method: 'POST',
        headers: { Authorization: `Bearer ${signedIn.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Quota smoke check', prompt: 'Must not invoke AI', mode: 'multiplayer', userId: ids[1] }),
      });
      assert.equal(response.status, 429, 'The real API must reject a fully used fixture before spending');
      assert.equal((await response.json()).code, 'daily_generation_limit');
      assert.ok(Number(response.headers.get('Retry-After')) > 0);
      console.log('Live HTTP API rejected the exhausted fixture with 429.');
    }
    for (const client of [anonymous, player]) {
      const { error: rpcError } = await client.rpc('consume_game_generation', { p_user_id: ids[1] });
      assert.ok(rpcError, 'Browser roles cannot reserve or spoof another user');
      const { error: writeError } = await client.from('game_generation_usage').update({ attempts: 1 }).eq('user_id', ids[0]);
      assert.ok(writeError, 'Browser roles cannot reset counters');
    }
    console.log(JSON.stringify({ concurrentRequests: 21, admitted: 3, crossUserIsolation: true, separateUtcDays: true, anonymousAndAuthenticatedWritesDenied: true, paidCalls: 0 }));
  } finally {
    await player.auth.signOut();
    for (const id of ids) {
      const { error } = await admin.auth.admin.deleteUser(id);
      assert.equal(error, null, 'Fixture cleanup');
    }
    console.log('Disposable quota fixtures removed.');
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Quota test failed'); process.exitCode = 1; });
