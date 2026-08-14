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

test('Chrome Web Store screenshots use the required 1280 by 800 JPEG format', () => {
  const screenshots = [
    'chrome-dashboard-1280x800.jpg',
    'chrome-header-rules-1280x800.jpg',
    'chrome-rule-editor-1280x800.jpg',
    'chrome-environments-1280x800.jpg',
    'chrome-history-1280x800.jpg',
  ];

  screenshots.forEach((name) => {
    const file = fs.readFileSync(path.join(root, 'store-assets', name));
    assert.deepEqual([...file.subarray(0, 3)], [255, 216, 255], `${name} must be a JPEG`);
    const sof = file.indexOf(Buffer.from([255, 192]));
    assert.notEqual(sof, -1, `${name} must contain a baseline JPEG frame`);
    assert.equal(file.readUInt16BE(sof + 5), 800, `${name} must be 800 pixels high`);
    assert.equal(file.readUInt16BE(sof + 7), 1280, `${name} must be 1280 pixels wide`);
  });
});
