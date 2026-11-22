'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const checker = path.resolve(__dirname, 'check-play-package.cjs');
function runWithPackage(packageName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sijili-package-'));
  try {
    const file = path.join(dir, 'app.json');
    fs.writeFileSync(file, JSON.stringify({ expo: { android: { package: packageName } } }));
    return spawnSync(process.execPath, [checker], {
      encoding: 'utf8',
      env: { ...process.env, SIJILI_APP_JSON: file },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('allows only the documented Android application ID', () => {
  const result = runWithPackage('com.debtledgeriq.sijili');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
});

test('blocks the legacy customer-suffixed ID', () => {
  const result = runWithPackage('com.debtledgeriq.sijili.customer');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
});

test('blocks a missing Android application ID', () => {
  const result = runWithPackage(undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
});

test('blocks a similarly prefixed but incorrect ID', () => {
  const result = runWithPackage('com.debtledgeriq.sijili.debug');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
});


test('blocks a malformed Expo configuration without an unhandled stack trace', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sijili-invalid-'));
  try {
    const file = path.join(dir, 'app.json');
    fs.writeFileSync(file, '{invalid');
    const result = spawnSync(process.execPath, [checker], {
      encoding: 'utf8',
      env: { ...process.env, SIJILI_APP_JSON: file },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BLOCKED: Cannot read a valid Expo app.json/);
    assert.match(result.stderr, /Invalid or unreadable configuration/);
    assert.doesNotMatch(result.stderr, /SyntaxError:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks an absent Expo configuration with actionable diagnostics', () => {
  const file = path.join(os.tmpdir(), 'sijili-missing-' + process.pid, 'app.json');
  const result = spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    env: { ...process.env, SIJILI_APP_JSON: file },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED: Cannot read a valid Expo app.json/);
  assert.match(result.stderr, /Configuration file missing/);
});
