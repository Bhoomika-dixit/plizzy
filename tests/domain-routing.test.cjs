const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, URL, require: name => name in imports ? imports[name] : require(name) });
  return module.exports;
}
const sites = load('lib/site.ts');
const { proxy } = load('proxy.ts', { './lib/site': sites });

test('marketing roots serve the landing page, including campaign query strings', () => {
  for (const host of ['plizzy.in', 'www.plizzy.in']) {
    const response = proxy(new NextRequest(`https://${host}/?utm_source=friends`));
    const target = new URL(response.headers.get('x-middleware-rewrite'));
    assert.equal(response.status, 200);
    assert.equal(target.pathname, '/welcome');
    assert.equal(target.searchParams.get('utm_source'), 'friends');
  }
});

test('old game and room links retain their path and invite query on the app subdomain', () => {
  for (const path of ['/footer/rooms?invite=ABC123', '/play/game-id', '/profile', '/create-game?mode=multiplayer']) {
    const response = proxy(new NextRequest(`https://plizzy.in${path}`));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), sites.APP_ORIGIN + path);
  }
});

test('public Host takes precedence over Next.js internal request origin', () => {
  const root = proxy(new NextRequest('http://localhost:3000/', { headers: { host: 'plizzy.in' } }));
  assert.equal(new URL(root.headers.get('x-middleware-rewrite')).pathname, '/welcome');
  const oldLink = proxy(new NextRequest('http://localhost:3000/footer/home', { headers: { host: 'PLIZZY.IN:443' } }));
  assert.equal(oldLink.headers.get('location'), sites.APP_ORIGIN + '/footer/home');
});

test('marketing API requests are redirected with method-preserving status', () => {
  const response = proxy(new NextRequest('https://plizzy.in/api/generate-game', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), sites.APP_ORIGIN + '/api/generate-game');
});

test('app, local and preview requests keep existing authentication and gameplay routes', () => {
  for (const origin of [sites.APP_ORIGIN, 'http://localhost:3000', 'https://plizzy-preview.vercel.app']) {
    for (const path of ['/', '/footer/home', '/api/multiplayer']) {
      const response = proxy(new NextRequest(origin + path));
      assert.equal(response.headers.get('x-middleware-next'), '1');
      assert.equal(response.headers.get('location'), null);
    }
  }
});

test('internal landing route has a canonical marketing destination on production hosts', () => {
  for (const host of ['plizzy.in', 'app.plizzy.in']) {
    assert.equal(proxy(new NextRequest(`https://${host}/welcome`)).headers.get('location'), sites.MARKETING_ORIGIN + '/');
  }
});

test('untrusted paths cannot select an external redirect origin', () => {
  for (const path of ['//attacker.test/steal', '/%2f%2fattacker.test', '/footer/rooms?next=https://attacker.test']) {
    const response = proxy(new NextRequest(sites.MARKETING_ORIGIN + path));
    assert.equal(new URL(response.headers.get('location')).origin, sites.APP_ORIGIN);
  }
});

test('admin origin serves only its dashboard and API; other origins cannot serve admin APIs', () => {
  const root = proxy(new NextRequest('https://admin.plizzy.in/'));
  assert.equal(new URL(root.headers.get('x-middleware-rewrite')).pathname, '/admin');
  assert.equal(proxy(new NextRequest('https://admin.plizzy.in/api/admin')).headers.get('x-middleware-next'), '1');
  for (const path of ['/footer/home', '/api/generate-game', '/welcome']) assert.equal(proxy(new NextRequest('https://admin.plizzy.in' + path)).status, 404);
  for (const host of ['plizzy.in', 'app.plizzy.in', 'preview.vercel.app']) {
    assert.equal(proxy(new NextRequest(`https://${host}/api/admin`)).status, 404);
    assert.equal(proxy(new NextRequest(`https://${host}/admin`)).headers.get('location'), 'https://admin.plizzy.in/');
  }
  assert.equal(proxy(new NextRequest('http://localhost:3000/admin')).headers.get('x-middleware-next'), '1');
});

test('Home Screen manifest starts and stays on the app subdomain', () => {
  const manifest = JSON.parse(fs.readFileSync('public/app.webmanifest', 'utf8'));
  assert.equal(manifest.start_url, sites.APP_ORIGIN + '/');
  assert.equal(manifest.scope, sites.APP_ORIGIN + '/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(fs.existsSync('public' + icon.src));
  assert.ok(fs.existsSync('app/apple-icon.png'));
});

test('landing HTML offers the real app, an unavailable Play Store download and usable iPhone instructions', () => {
  const styles = new Proxy({}, { get: (_, key) => String(key) });
  const Icon = load('app/components/ui-icon.tsx').default;
  const PlayArt = load('app/components/play-art.tsx').default;
  const IphoneGuide = load('app/welcome/iphone-guide.tsx', { '../components/ui-icon': { default: Icon }, '@/lib/site': sites, './welcome.module.css': { default: styles } }).default;
  const page = load('app/welcome/page.tsx', { '../components/ui-icon': { default: Icon }, '../components/play-art': { default: PlayArt }, './iphone-guide': { default: IphoneGuide }, '@/lib/site': sites, './welcome.module.css': { default: styles } });
  const html = renderToStaticMarkup(require('react').createElement(page.default));
  assert.ok(html.includes(`href="${sites.APP_ORIGIN}"`));
  assert.match(html, /disabled="" aria-label="Google Play download coming soon"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /<dialog[^>]+aria-labelledby="iphone-title"/);
  assert.match(html, /Add to Home Screen/);
  assert.match(html, /Open as Web App/);
  assert.match(html, /No App Store download needed/);
  assert.equal(page.metadata.alternates.canonical, sites.MARKETING_ORIGIN);
  assert.equal(page.metadata.manifest, null);
});
