'use strict';
// Fail closed before a Google Play build if the native package differs from the documented listing.
// The documented ID must be confirmed against the real Play Console listing before any AAB upload.
const fs = require('node:fs');
const path = require('node:path');
const appPath = process.env.SIJILI_APP_JSON || path.resolve(__dirname, '../apps/customer/app.json');
const expected = 'com.debtledgeriq.sijili';

let actual;
try {
  const config = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  actual = config?.expo?.android?.package;
} catch (error) {
  console.error('BLOCKED: Cannot read a valid Expo app.json for the Play package check.');
  console.error('Reason:', error.code === 'ENOENT' ? 'Configuration file missing' : 'Invalid or unreadable configuration');
  process.exit(1);
}
if (actual !== expected) {
  console.error('BLOCKED: Android package differs from the documented Play ID.');
  console.error('Expected:', expected);
  console.error('Configured:', actual || '(missing)');
  console.error('Verify the actual Play Console listing before changing either value or building an AAB.');
  process.exitCode = 1;
} else {
  console.log('PASS: Android package matches the documented Play ID:', actual);
}
