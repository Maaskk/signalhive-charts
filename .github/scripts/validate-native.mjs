import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pkg = json('package.json');
const config = json('src-tauri/tauri.conf.json');
const capability = json('src-tauri/capabilities/frontend-only.json');
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
assert.equal(config.version, pkg.version, 'Tauri/frontend versions must agree');
assert.match(cargo, new RegExp(`version = "${pkg.version.replaceAll('.', '\\.')}"`));
assert.equal(config.build.frontendDist, '../dist');
assert.equal(config.build.devUrl, 'http://127.0.0.1:1420');
assert.equal(config.app.withGlobalTauri, false);
assert.deepEqual(capability.permissions, []);
assert.deepEqual(capability.windows, ['main']);
assert.deepEqual(config.app.security.capabilities, ['frontend-only']);
assert.match(config.app.security.csp, /object-src 'none'/);
assert.equal(json('src-tauri/tauri.android.conf.json').bundle.android.minSdkVersion, 24);
const ios = json('src-tauri/tauri.ios.conf.json').bundle.iOS;
assert.equal(ios.minimumSystemVersion, '16.0');
assert.equal(ios.developmentTeam, undefined, 'Public config must not invent an Apple signing team');
assert.ok(!config.plugins || Object.keys(config.plugins).length === 0);
for (const icon of config.bundle.icon)
  assert.ok(existsSync(`src-tauri/${icon}`), `Missing icon ${icon}`);
console.log('Native wrapper metadata, version, icons and empty native permissions are valid.');
