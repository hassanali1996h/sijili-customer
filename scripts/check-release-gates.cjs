'use strict';
// Read-only release gate runner. Never builds, publishes, or changes credentials.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const gates = [
  ['Android package', 'scripts/check-play-package.cjs'],
  ['Android package regression tests', 'scripts/check-play-package.test.cjs', '--test'],
  ['Public policy pages', 'scripts/check-public-policy-pages.cjs'],
];
let failures = 0;
for (const [label, relative, flag] of gates) {
  const script = path.join(root, relative);
  if (!fs.existsSync(script)) {
    console.error(`BLOCKED ${label}: missing ${relative}`);
    failures++;
    continue;
  }
  const args = flag ? [flag, script] : [script];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 45000 });
  if (result.error || result.status !== 0) {
    console.error(`BLOCKED ${label}: ${result.error?.message || `exit ${result.status ?? 'unknown'}`}`);
    failures++;
  } else {
    console.log(`PASS ${label}`);
  }
}
if (failures) {
  console.error(`RELEASE BLOCKED: ${failures} gate(s) failed. No AAB should be submitted.`);
  process.exitCode = 1;
} else {
  console.log('Static gates passed. This does NOT certify OTP, RLS, payments, or store compliance.');
}
