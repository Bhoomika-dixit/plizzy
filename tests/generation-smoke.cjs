// Opt-in real-provider test. Credentials are supplied via environment, never saved.
const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
async function main() {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: process.env.PLIZZY_DEMO_EMAIL, password: process.env.PLIZZY_DEMO_PASSWORD });
  if (error) throw error;
  const response = await fetch('http://localhost:3000/api/generate-game', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ title: process.argv[2] || 'Multiplayer contract test', mode: 'multiplayer', prompt: process.argv[3] || 'Create a three-player competitive trivia game with individual boards and simultaneous play. Use text and emoji only.' }) });
  const result = await response.json();
  if (!response.ok) throw Error(JSON.stringify(result));
  fs.writeFileSync('resources/multiplayer-generated-smoke.json', JSON.stringify(result, null, 2));
  fs.writeFileSync(`resources/multiplayer-generated-${result.versionId}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ gameId: result.gameId, versionId: result.versionId, mode: result.definition?.config.mode, multiplayer: result.definition?.multiplayer, renderer: result.definition?.renderer.id, rules: result.definition?.rules.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
