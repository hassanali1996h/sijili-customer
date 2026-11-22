#!/usr/bin/env node
// Public legal-page smoke test; does not certify legal compliance.
const https = require('node:https');
const pages = ['privacy.html', 'delete-account.html', 'terms.html', 'support.html'];
const base = 'https://hassanali1996h.github.io/sijili-customer/';
function fetch(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, {timeout: 12000, headers: {'User-Agent': 'sijili-policy-check/1.0'}}, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 3) {
        res.resume(); return resolve(fetch(new URL(res.headers.location, url).href, redirects + 1));
      }
      let body = ''; res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 200000) res.destroy(new Error('Page too large')); });
      res.on('end', () => resolve({status: res.statusCode, body, type: res.headers['content-type'] || ''}));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('Request timeout')); });
  });
}
(async () => {
  let failed = false;
  for (const page of pages) {
    try {
      const r = await fetch(base + page);
      const valid = r.status === 200 && /text\/html/i.test(r.type) && /<html[\s>]/i.test(r.body) && !/<title>\s*404/i.test(r.body) && r.body.length > 250;
      console.log(`${valid ? 'PASS' : 'FAIL'} ${page} HTTP ${r.status} (${r.body.length} chars)`);
      if (!valid) failed = true;
    } catch (e) { console.error(`FAIL ${page}: ${e.message}`); failed = true; }
  }
  if (failed) process.exitCode = 1;
})();