'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseFrontmatter,
  parsePlan,
  getPlanResumptionPoint,
  findActivePlan,
} = require('../lib/plan');

const SAMPLE_PLAN = `---
date: 2026-09-26T04:30:00Z
research_doc: docs/research/2026-09-26-topic.md
branch: feature/my-feature
status: planned
phases_total: 2
phases_completed: 1
---

# Implementation Plan: My Feature

## Phased Execution Checklist

### Phase 1: Core Implementation
- [x] Task 1.1: Setup initial structures
- [x] Task 1.2: Add business logic
*Automated Verification:* \`npm test\`

### Phase 2: Integration & Delivery
- [x] Task 2.1: Integrate adapters
- [ ] Task 2.2: Add unit tests
- [ ] Task 2.3: Verify documentation
*Automated Verification:* \`npm test && npm run lint\`
`;

test('parseFrontmatter: extracts metadata and body', () => {
  const result = parseFrontmatter(SAMPLE_PLAN);
  assert.strictEqual(result.metadata.branch, 'feature/my-feature');
  assert.strictEqual(result.metadata.status, 'planned');
  assert.strictEqual(result.metadata.phases_total, 2);
  assert.strictEqual(result.metadata.phases_completed, 1);
  assert.ok(result.body.includes('# Implementation Plan: My Feature'));
});

test('parsePlan: extracts phases, tasks, checkboxes, and verification commands', () => {
  const plan = parsePlan(SAMPLE_PLAN);
  assert.strictEqual(plan.phasesTotal, 2);
  assert.strictEqual(plan.phasesCompleted, 1);
  assert.strictEqual(plan.isComplete, false);

  // Phase 1
  const p1 = plan.phases[0];
  assert.strictEqual(p1.number, 1);
  assert.strictEqual(p1.title, 'Core Implementation');
  assert.strictEqual(p1.tasksTotal, 2);
  assert.strictEqual(p1.tasksCompleted, 2);
  assert.strictEqual(p1.isComplete, true);
  assert.strictEqual(p1.verificationCommand, 'npm test');

  // Phase 2
  const p2 = plan.phases[1];
  assert.strictEqual(p2.number, 2);
  assert.strictEqual(p2.title, 'Integration & Delivery');
  assert.strictEqual(p2.tasksTotal, 3);
  assert.strictEqual(p2.tasksCompleted, 1);
  assert.strictEqual(p2.isComplete, false);
  assert.strictEqual(p2.verificationCommand, 'npm test && npm run lint');
});

test('getPlanResumptionPoint: identifies active phase and first pending task', () => {
  const plan = parsePlan(SAMPLE_PLAN);
  const resumption = getPlanResumptionPoint(plan);

  assert.strictEqual(resumption.activePhaseIndex, 1);
  assert.strictEqual(resumption.phaseNumber, 2);
  assert.strictEqual(resumption.phaseTitle, 'Integration & Delivery');
  assert.strictEqual(resumption.firstUncheckedTask, 'Task 2.2: Add unit tests');
  assert.strictEqual(resumption.verificationCommand, 'npm test && npm run lint');
  assert.strictEqual(resumption.isComplete, false);
});

test('getPlanResumptionPoint: reports completion when all tasks checked', () => {
  const completedContent = SAMPLE_PLAN.replace(/- \[ \]/g, '- [x]');
  const plan = parsePlan(completedContent);
  const resumption = getPlanResumptionPoint(plan);

  assert.strictEqual(resumption.isComplete, true);
  assert.strictEqual(resumption.firstUncheckedTask, null);
});

test('findActivePlan: finds plan matching active branch', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-plan-branch-' + Date.now());
  const plansDir = path.join(tmpDir, 'docs', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const planA = SAMPLE_PLAN.replace('feature/my-feature', 'feature/other-branch');
  const planB = SAMPLE_PLAN.replace('feature/my-feature', 'feature/target-branch');

  fs.writeFileSync(path.join(plansDir, '2026-09-26-other.md'), planA);
  fs.writeFileSync(path.join(plansDir, '2026-09-26-target.md'), planB);

  const active = findActivePlan(tmpDir, 'feature/target-branch');
  assert.ok(active, 'should find active plan');
  assert.strictEqual(active.file, '2026-09-26-target.md');
  assert.strictEqual(active.metadata.branch, 'feature/target-branch');
});

test('findActivePlan: falls back to in-progress plan if branch does not match', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-plan-fallback-' + Date.now());
  const plansDir = path.join(tmpDir, 'docs', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const completedPlan = SAMPLE_PLAN.replace('status: planned', 'status: complete');
  const inProgressPlan = SAMPLE_PLAN.replace('status: planned', 'status: in-progress');

  fs.writeFileSync(path.join(plansDir, '2026-09-26-done.md'), completedPlan);
  fs.writeFileSync(path.join(plansDir, '2026-09-26-active.md'), inProgressPlan);

  const active = findActivePlan(tmpDir, 'feature/unknown-branch');
  assert.ok(active, 'should find in-progress plan');
  assert.strictEqual(active.file, '2026-09-26-active.md');
});
