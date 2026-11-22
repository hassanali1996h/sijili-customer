'use strict';
// Fail closed before a Google Play build if the native package differs from the approved listing.
// The expected ID is the product owner's documented ID; change it only after verifying Play Console.
const fs = require('node:fs');
const path = require('node:path');
const appPath = process.env.SIJILI_APP_JSON || path.resolve(__dirname, '../apps/customer/app.json');
const expected = 'com.debtledgeriq.sijili';
const actual = JSON.parse(fs.readFileSync(appPath, 'utf8')).expo?.android?.package;
if (actual !== expected) {
  console.error('BLOCKED: Android package differs from the documented Play ID.');
  console.error('Expected:', expected);
  console.error('Configured:', actual || '(missing)');
  console.error('Verify the actual Play Console listing before changing either value or building an AAB.');
  process.exitCode = 1;
} else {
  console.log('PASS: Android package matches the documented Play ID:', actual);
}
