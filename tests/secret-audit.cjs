// Prints locations only, never matched secret values.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const files = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const configured = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (!match || !/KEY|TOKEN|SECRET|PASSWORD/.test(match[1])) return [];
  const value = match[2].replace(/^['"]|['"]$/g, '');
  return value.length >= 16 && !/YOUR_|\.\.\./.test(value) ? [{ name: match[1], value }] : [];
}) : [];
const patterns = [ /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/g, /\bsb_secret_[A-Za-z0-9_-]{16,}/g, /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g ];
const findings = [];
let clientBundlesChecked = 0;
function scanClient(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) scanClient(file);
    else {
      clientBundlesChecked++;
      const content = fs.readFileSync(file, 'utf8');
      for (const key of configured.filter(key => !/PUBLIC/.test(key.name))) if (content.includes(key.value)) findings.push({ file, configuredKey: key.name, type: 'client bundle' });
    }
  }
}
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const key of configured) if (content.includes(key.value)) findings.push({ file, configuredKey: key.name });
  for (const pattern of patterns) { pattern.lastIndex = 0; if (pattern.test(content)) findings.push({ file, type: 'credential pattern' }); }
}
scanClient('.next/static');
scanClient('.next/dev/static');
let historyBlobsChecked = 0;
if (process.argv.includes('--history')) {
  const objects = execFileSync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8' }).trim().split('\n');
  const paths = new Map(objects.map(line => { const space = line.indexOf(' '); return [space < 0 ? line : line.slice(0, space), space < 0 ? '(git object)' : line.slice(space + 1)]; }));
  const output = execFileSync('git', ['cat-file', '--batch'], { input: [...paths.keys()].join('\n') + '\n', maxBuffer: 128 * 1024 * 1024 });
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(10, offset);
    const [oid, type, size] = output.subarray(offset, end).toString().split(' ');
    offset = end + 1;
    const content = output.subarray(offset, offset + Number(size)).toString('utf8');
    offset += Number(size) + 1;
    if (type !== 'blob') continue;
    historyBlobsChecked++;
    for (const key of configured) if (content.includes(key.value)) findings.push({ file: paths.get(oid), object: oid, configuredKey: key.name });
    for (const pattern of patterns) { pattern.lastIndex = 0; if (pattern.test(content)) findings.push({ file: paths.get(oid), object: oid, type: 'historical credential pattern' }); }
    for (const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
      try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'service_role') findings.push({ file: paths.get(oid), object: oid, type: 'historical service-role JWT' }); } catch {}
    }
  }
}
console.log(JSON.stringify({ scannedFiles: files.length, configuredKeysChecked: configured.length, clientBundlesChecked, historyBlobsChecked, findings }, null, 2));
if (findings.length) process.exitCode = 1;
