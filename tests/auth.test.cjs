const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/auth/flow.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports, URL, URLSearchParams });
const authFlow = moduleUnderTest.exports;

test('only room invites survive authentication; redirect attacks are rejected', () => {
  for (const next of [null, '', '//evil.example/footer/rooms?invite=X', 'https://evil.example/footer/rooms?invite=X', '/\\evil.example/footer/rooms?invite=X', '/footer/rooms/../profile?invite=X', '/auth/callback?code=secret', '/footer/rooms?invite=X\n']) {
    assert.equal(authFlow.signedInDestination(next), '/footer/home');
  }
  assert.equal(authFlow.signedInDestination('/footer/rooms?invite=AB12&code=secret#ignored'), '/footer/rooms?invite=AB12');
  assert.equal(authFlow.signedInDestination('/footer/rooms?invite=A%26B'), '/footer/rooms?invite=A%26B');
});

test('new and returning players use the same Supabase email code request', async () => {
  let input;
  const result = await authFlow.sendEmailCode({ signInWithOtp: async value => { input = value; return { data: { session: null }, error: null }; } }, ' player@example.com ');
  assert.deepEqual(JSON.parse(JSON.stringify(input)), { email: 'player@example.com', options: { shouldCreateUser: true } });
  assert.equal(result.data.session, null, 'Requesting a code must not sign in the player');
});

test('OTP verification preserves leading zeros and requires a real provider session', async () => {
  let input;
  const result = await authFlow.verifyEmailCode({ verifyOtp: async value => { input = value; return { data: { session: null }, error: { code: 'otp_expired' } }; } }, ' player@example.com ', '001234');
  assert.deepEqual(JSON.parse(JSON.stringify(input)), { email: 'player@example.com', token: '001234', type: 'email' });
  assert.equal(result.data.session, null);
  assert.equal(result.error.code, 'otp_expired');
  for (const token of ['123', '12345a', '12345678901', ' 123456', '<script>']) {
    await assert.rejects(authFlow.verifyEmailCode({ verifyOtp: () => assert.fail('Invalid codes must not reach Auth') }, 'player@example.com', token));
  }
});

test('errors hide account existence and provider details; rate limiting has actionable copy', () => {
  assert.equal(authFlow.authErrorMessage({ code: 'user_not_found', message: 'private@example.com' }, 'send'), authFlow.authErrorMessage({ code: 'email_exists' }, 'send'));
  assert.match(authFlow.authErrorMessage({ status: 429 }, 'verify'), /wait/);
  assert.match(authFlow.authErrorMessage({ code: 'otp_expired' }, 'verify'), /latest email/);
});
