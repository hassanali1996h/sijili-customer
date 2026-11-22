// Run with: node scripts/test-phone.cjs (requires workspace dev dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../packages/shared/src/phone.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });
const { normalizeIraqiPhone, toAsciiDigits } = exports;

assert.equal(toAsciiDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹'), '0123456789 0123456789');

const valid = [
  ['07501234567', '+9647501234567'],
  ['7501234567', '+9647501234567'],
  ['9647501234567', '+9647501234567'],
  ['+964 750 123 4567', '+9647501234567'],
  ['009647501234567', '+9647501234567'],
  ['٠٧٥٠١٢٣٤٥٦٧', '+9647501234567'],
  ['۰۷۵۰۱۲۳۴۵۶۷', '+9647501234567'],
  ['(0750) 123-4567', '+9647501234567'],
];
const invalid = [
  '', '+964', '0750123456', '075012345678', '+96407501234567',
  '+201001234567', '001234567890', '+447700900123',
  '0770abc12345', '+9647501234567x', '++9647501234567',
  '0750+1234567', '0096407501234567',
];
for (const [input, expected] of valid) {
  assert.equal(normalizeIraqiPhone(input), expected, `valid: ${input}`);
}
for (const input of invalid) {
  assert.equal(normalizeIraqiPhone(input), '', `invalid: ${input}`);
}
console.log(`PASS Iraqi phone normalization: ${valid.length + invalid.length + 1} assertions`);
