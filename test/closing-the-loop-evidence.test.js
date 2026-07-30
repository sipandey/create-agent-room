'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  extractAddedContent,
  matchesWaiver,
  matchesAntiPatternEntry,
  matchesDecisionEntry,
  validateLogEvidenceFromDiff,
} = require('../lib/closing-the-loop-evidence');

test('extractAddedContent: pulls only + lines from a unified diff', () => {
  const diff = [
    '--- a/.agent-room/decisions.md',
    '+++ b/.agent-room/decisions.md',
    '@@ -1,3 +1,4 @@',
    ' line',
    '+<!-- no-log: routine test run -->',
    ' context',
  ].join('\n');
  assert.match(extractAddedContent(diff), /no-log: routine test run/);
});

test('matchesWaiver: rejects empty, too-short, or verb-free waiver reasons', () => {
  assert.strictEqual(matchesWaiver('<!-- no-log: short -->'), false);
  assert.strictEqual(matchesWaiver('<!-- no-log: -->'), false);
  assert.strictEqual(matchesWaiver(''), false);
  assert.strictEqual(
    matchesWaiver('<!-- no-log: abcdefghijklmnopqrst -->'),
    false,
    '20+ chars without a waiver keyword should fail'
  );
  assert.strictEqual(
    matchesWaiver('<!-- no-log: routine fix test -->'),
    false,
    'under 20 chars should fail even with keywords'
  );
});

test('matchesWaiver: accepts a no-log comment with sufficient reason and keyword', () => {
  assert.strictEqual(
    matchesWaiver('<!-- no-log: routine change, nothing worth recording -->'),
    true
  );
  assert.strictEqual(
    matchesWaiver('<!-- no-log: dogfood validation pass on this repo -->'),
    true
  );
});

test('matchesAntiPatternEntry: requires dated header and a known field', () => {
  const entry = [
    '### 2026-07-30 — hook ignored guidance',
    '',
    '**What happened:** agent shipped without reading AGENTS.md.',
    '**Root cause:** rules file was plain .md.',
    '**Avoid:** scaffold .mdc with alwaysApply.',
  ].join('\n');
  assert.strictEqual(matchesAntiPatternEntry(entry), true);
  assert.strictEqual(matchesAntiPatternEntry('### 2026-07-30 — title only'), false);
});

test('matchesDecisionEntry: requires Decision and Why fields', () => {
  const entry = [
    '### 2026-07-30 — evidence-lite scope',
    '',
    '**Decision:** validate log diffs in the stop hook first.',
    '**Why:** presence-only checks are easy to game.',
    '**Rejected:** session-log requirement at stop time (too heavy).',
  ].join('\n');
  assert.strictEqual(matchesDecisionEntry(entry), true);
  assert.strictEqual(
    matchesDecisionEntry('### 2026-07-30 — x\n\n**Decision:** only one field'),
    false
  );
});

test('validateLogEvidenceFromDiff: passes on any valid added evidence in diff', () => {
  const diff = [
    '--- a/.agent-room/decisions.md',
    '+++ b/.agent-room/decisions.md',
    '@@ -17,3 +17,4 @@',
    ' <!-- Entries go below this line, newest first. -->',
    '+<!-- no-log: dogfood validation pass on repo -->',
  ].join('\n');
  assert.strictEqual(validateLogEvidenceFromDiff(diff), true);
});

test('validateLogEvidenceFromDiff: fails on whitespace-only touches', () => {
  const diff = [
    '--- a/.agent-room/decisions.md',
    '+++ b/.agent-room/decisions.md',
    '@@ -1,3 +1,4 @@',
    ' line',
    '+',
    '+   ',
  ].join('\n');
  assert.strictEqual(validateLogEvidenceFromDiff(diff), false);
});
