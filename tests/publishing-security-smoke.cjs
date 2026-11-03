// Opt-in: node --env-file=.env tests/publishing-security-smoke.cjs
// Tests the real REST permissions with disposable users and games. No AI/email.
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key && service, 'Server-only test configuration is required');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, service, options);
  const anonymous = createClient(url, key, options);
  const player = createClient(url, key, options);
  const fixtures = [];
  try {
    for (let i = 0; i < 2; i++) {
      const email = `plizzy-publishing-${randomUUID()}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      assert.equal(error, null, 'Create isolated fixture');
      fixtures.push({ id: data.user.id, email });
    }
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: fixtures[0].email });
    assert.equal(linkError, null);
    const { error: verifyError } = await player.auth.verifyOtp({ email: fixtures[0].email, token: link.properties.email_otp, type: 'email' });
    assert.equal(verifyError, null);
    const args = {
      p_creator_id: fixtures[1].id,
      p_title: 'Temporary publishing security fixture', p_summary: 'Security test',
      p_prompt: 'Security test only', p_rules_markdown: 'No gameplay',
      p_min_players: 1, p_max_players: 1, p_estimated_duration_minutes: 1,
      p_game_mode: 'single_player', p_definition: {}, p_visual_theme: {}, p_generation_metadata: { securityFixture: true },
    };
    for (const client of [anonymous, player]) {
      for (const owner of fixtures) {
        const { error } = await client.rpc('publish_generated_game', { ...args, p_creator_id: owner.id });
        assert.equal(error?.code, '42501', 'Browser publishing must be denied for own and forged creator IDs');
      }
    }
    const { count, error: countError } = await admin.from('games').select('id', { count: 'exact', head: true }).in('creator_id', fixtures.map(f => f.id));
    assert.equal(countError, null);
    assert.equal(count, 0, 'Denied attempts created no records');
    const { data: published, error: publishError } = await admin.rpc('publish_generated_game', args);
    assert.equal(publishError, null, 'Trusted server publishing still works without elevated function privileges');
    assert.equal(published.length, 1);
    const { data: game, error: gameError } = await admin.from('games').select('creator_id, latest_version_id').eq('id', published[0].game_id).single();
    assert.equal(gameError, null);
    assert.equal(game.creator_id, fixtures[1].id);
    assert.equal(game.latest_version_id, published[0].version_id);
    const { data: saved, error: savedError } = await admin.from('user_games').select('is_saved').eq('game_id', published[0].game_id).eq('user_id', fixtures[1].id).single();
    assert.equal(savedError, null);
    assert.equal(saved.is_saved, true);
    console.log(JSON.stringify({ anonymousDenied: true, authenticatedDenied: true, forgedCreatorDenied: true, deniedAttemptsCreatedNoRecords: true, servicePublishingWorks: true, paidCalls: 0 }));
  } finally {
    await player.auth.signOut();
    if (fixtures.length) {
      const { error } = await admin.from('games').delete().in('creator_id', fixtures.map(f => f.id));
      assert.equal(error, null, 'Remove only games owned by these disposable users');
      for (const fixture of fixtures) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(fixture.id);
        assert.equal(deleteError, null, 'Remove disposable user');
      }
      console.log('Disposable publishing fixtures removed.');
    }
  }
}
main().catch(() => { console.error('Publishing security smoke check failed. No credentials or codes have been logged.'); process.exitCode = 1; });
