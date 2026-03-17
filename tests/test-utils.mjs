// ============================================================
// Unit Tests — Pure utility functions
// Run: node tests/test-utils.mjs
// ============================================================

import { formatTime } from '../utils.js';

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${name} — expected "${expected}", got "${actual}"`);
  }
}

// ---- formatTime ----

console.log('formatTime');
assert('0ms',          formatTime(0),       '0:00');
assert('1s',           formatTime(1000),    '0:01');
assert('59s',          formatTime(59000),   '0:59');
assert('1m',           formatTime(60000),   '1:00');
assert('1m 5s',        formatTime(65000),   '1:05');
assert('3m 51s',       formatTime(231000),  '3:51');
assert('10m',          formatTime(600000),  '10:00');
assert('99m 59s',      formatTime(5999000), '99:59');
assert('fractional',   formatTime(1500),    '0:01');
assert('large 1h+',    formatTime(3661000), '61:01');

// ---- Result ----

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
