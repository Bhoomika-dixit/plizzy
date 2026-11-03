const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const moduleFixture = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('agent-harness/cover-svg.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleFixture, exports: moduleFixture.exports });
const { coverSvg } = moduleFixture.exports;
const definition = (values, visuals = {}) => ({
  entities: values.map(value => ({ content: { kind: 'text', value } })),
  visuals: { backgroundColor: '#ffffff', accentColor: '#7766ff', textColor: '#111111', ...visuals },
});

test('generated entity markup is rendered as text, never executable SVG', () => {
  const svg = coverSvg('Safe title', definition([
    '</text><script>alert(1)</script><text>',
    '</text><image href="https://attacker.test/leak"/><text>',
    `A & B < C > D "double" 'single'`,
  ]));
  assert.ok(svg.includes('&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;text&gt;'));
  assert.ok(svg.includes('&lt;image href=&quot;https://attacker.test/leak&quot;/&gt;'));
  assert.ok(svg.includes('A &amp; B &lt; C &gt; D &quot;double&quot; &apos;single&apos;'));
  assert.doesNotMatch(svg, /<script|<image|<foreignObject/i);
  assert.equal((svg.match(/<text /g) || []).length, 5);
});

test('title truncation preserves complete XML entities and Unicode characters', () => {
  const svg = coverSvg('A'.repeat(27) + '&<script>', definition(['🐟', 'नमस्ते']));
  assert.ok(svg.includes('A'.repeat(27) + '&amp;</text>'));
  assert.ok(svg.includes('🐟</text>'));
  assert.ok(svg.includes('नमस्ते</text>'));
  assert.ok(coverSvg('A'.repeat(27) + '🐟tail', definition([])).includes('A'.repeat(27) + '🐟</text>'));
});

test('every interpolated SVG attribute is escaped and asset URLs stay out of covers', () => {
  const game = definition([], { textColor: '"/><script>alert(1)</script><text fill="' });
  game.entities.push({ content: { kind: 'asset', value: 'https://attacker.test/image.svg' } });
  const svg = coverSvg('<>&"\'', game);
  assert.ok(svg.includes('&lt;&gt;&amp;&quot;&apos;</text>'));
  assert.ok(svg.includes('fill="&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;text fill=&quot;"'));
  assert.ok(svg.includes('✦</text>'));
  assert.doesNotMatch(svg, /<script|https:\/\/attacker/i);
});
