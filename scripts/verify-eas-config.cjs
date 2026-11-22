'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'apps', 'customer');
const expo = JSON.parse(fs.readFileSync(path.join(appDir, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(appDir, 'eas.json'), 'utf8'));

assert.equal(expo.owner, 'hassanali22', 'Unexpected EAS account owner');
assert.equal(expo.slug, 'debt-ledger-customer', 'EAS slug must match the existing cloud project');
assert.equal(expo.extra?.eas?.projectId, '3fe77bf8-4c73-471c-bebc-810aa40d51bc', 'Existing EAS project ID changed');
assert.equal(expo.android?.package, 'com.debtledgeriq.sijili.customer', 'Android applicationId differs from the Play Console draft');
assert.equal(eas.build?.production?.distribution, 'store', 'Production profile must be a store build');
assert.equal(eas.build?.production?.android?.buildType, 'app-bundle', 'Google Play needs an AAB');
assert.equal(eas.build?.production?.environment, 'production', 'Production EAS environment missing');
assert.equal(eas.build?.preview?.android?.buildType, 'apk', 'Preview must remain installable APK');
assert.equal(eas.build?.preview?.env?.EXPO_PUBLIC_DEBT_LEDGER_PREVIEW, '1', 'Demo preview guard changed');
assert.equal(eas.build?.['preview-connected']?.env?.EXPO_PUBLIC_DEBT_LEDGER_PREVIEW, '0', 'Connected preview must disable demo mode');

console.log('Expo/EAS configuration checks passed for customer.');
