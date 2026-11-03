// Opt-in: node --env-file=.env tests/auth-smoke.cjs
// Uses only its own disposable fixture. No email is sent; no code/token is logged.
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && publishableKey && serviceKey, 'Server-only test configuration is required');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, serviceKey, options);
  const player = createClient(url, publishableKey, options);
  const email = `plizzy-auth-fixture-${randomUUID()}@example.com`;
  let fixtureId;
  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: 'Temporary auth test' } });
    assert.equal(createError?.code, undefined, 'Fixture creation failed');
    fixtureId = created.user.id;
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    assert.equal(linkError?.code, undefined, 'Fixture code generation failed');
    const token = link.properties.email_otp;
    assert.match(token, /^\d{6,10}$/);
    const { data: verified, error: verifyError } = await player.auth.verifyOtp({ email, token, type: 'email' });
    assert.equal(verifyError?.code, undefined, 'Email code verification failed');
    assert.equal(verified.session.user.id, fixtureId);
    const { data: identity, error: userError } = await player.auth.getUser();
    assert.equal(userError?.code, undefined);
    assert.equal(identity.user.id, fixtureId);
    const { data: profile, error: profileError } = await player.from('profiles').select('id, display_name').eq('id', fixtureId).single();
    assert.equal(profileError?.code, undefined, 'Verified user must be able to read their profile');
    assert.equal(profile.id, fixtureId);
    assert.equal(profile.display_name, 'Temporary auth test');
    const { error: reuseError } = await player.auth.verifyOtp({ email, token, type: 'email' });
    assert.ok(reuseError, 'A consumed code must never create another session');
    console.log(JSON.stringify({ realEmailCodeVerified: true, authenticatedUserVerified: true, profileReadable: true, codeReuseRejected: true, mailSent: false }));
  } finally {
    await player.auth.signOut();
    if (fixtureId) {
      const { error } = await admin.auth.admin.deleteUser(fixtureId);
      assert.equal(error?.code, undefined, 'Fixture cleanup failed');
      console.log('Disposable auth fixture removed.');
    }
  }
}

main().catch(() => { console.error('Auth smoke check failed. No credentials or codes have been logged.'); process.exitCode = 1; });
