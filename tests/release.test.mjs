import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest references existing release files', () => {
  const required = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((entry) => entry.js ?? []),
  ];
  required.forEach((relative) => {
    assert.equal(fs.existsSync(path.join(root, relative)), true, `Missing ${relative}`);
  });
});

test('content scripts parse as classic scripts', () => {
  manifest.content_scripts.flatMap((entry) => entry.js ?? []).forEach((relative) => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotThrow(() => new vm.Script(source, { filename: relative }));
  });
});

test('main-world interceptor contains no extension API calls', () => {
  const source = fs.readFileSync(path.join(root, 'dist/content/interceptor.js'), 'utf8');
  assert.doesNotMatch(source, /\bchrome\./);
});

test('isolated bridge does not broadcast complete rule configuration', () => {
  const source = fs.readFileSync(path.join(root, 'dist/content/bridge.js'), 'utf8');
  assert.doesNotMatch(source, /type:\s*['"]CONFIG['"]/);
  assert.match(source, /data\.type\s*===\s*['"]MATCH_REQUEST['"]/);
  assert.match(source, /type:\s*['"]MATCH_RESPONSE['"]/);
});

test('manifest uses least-privilege implemented permissions', () => {
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ['declarativeNetRequestWithHostAccess', 'storage', 'webRequest'].sort()
  );
  assert.equal('web_accessible_resources' in manifest, false);
});
