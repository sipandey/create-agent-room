'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { runInit } = require('../lib/init');
const { runValidate } = require('../lib/validate');

test('runValidate: passes on a cleanly scaffolded room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-pass-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scaffold it
  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'CleanRoom',
    force: true
  });

  // Intercept process.exitCode
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, undefined, 'Exit code should remain undefined (meaning success)');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: fails when required files are missing', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-fail-missing-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'BrokenRoom',
    force: true
  });

  // Remove a required file
  fs.unlinkSync(path.join(tmpDir, 'AGENTS.md'));

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'Exit code should be set to 1 on validation failure');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: fails when guardrails.json is malformed or invalid', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-fail-json-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'BrokenJSONRoom',
    force: true
  });

  // Write invalid JSON to guardrails.json
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), 'invalid json block');

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'Exit code should be 1 for invalid guardrails.json');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: fails when guardrails.json is missing required array properties', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-fail-schema-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'BrokenSchemaRoom',
    force: true
  });

  // Write incomplete properties to guardrails.json
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify({
    protectedPaths: ['/tmp']
    // missing requireApprovalFor and forbiddenActions
  }));

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'Exit code should be 1 for incomplete properties');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: fails when a skill is missing name/description frontmatter', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-fail-skills-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'BrokenSkillsRoom',
    force: true
  });

  // Write malformed skill file (missing frontmatter name)
  const skillFile = path.join(tmpDir, '.agent-room', 'skills', 'broken.md');
  fs.writeFileSync(skillFile, `---
description: "Missing name metadata completely"
---
# Content here`);

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'Exit code should be 1 for missing name metadata');
  } finally {
    process.exitCode = originalExitCode;
  }
});

// Regression: `init` now defaults to --profile minimal, which deliberately
// skips principles.md/workflow-classifier.md/coordination/. Before
// runValidate learned to read the profile from .agent-room.json, a
// freshly-scaffolded default room would fail its own `validate` command
// (and the CI workflow that runs it) for correctly not having files it
// never claimed to scaffold.
test('runValidate: passes (with warnings, not errors) on a default --profile minimal room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-minimal-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'MinimalRoom', force: true });

  assert.strictEqual(fs.existsSync(path.join(tmpDir, '.agent-room', 'principles.md')), false);

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, undefined, 'a minimal-profile room must pass validate, not fail it');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: still requires principles.md/workflow-classifier.md/coordination/ for a --profile full room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-full-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'FullRoom', profile: 'full', force: true });
  fs.rmSync(path.join(tmpDir, '.agent-room', 'principles.md'));

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'a full-profile room missing principles.md must still fail validate');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: treats a room with no .agent-room.json (or an unreadable one) as full-profile for backward compatibility', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-legacy-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'LegacyRoom', profile: 'full', force: true });
  fs.rmSync(path.join(tmpDir, '.agent-room.json'));
  fs.rmSync(path.join(tmpDir, '.agent-room', 'principles.md'));

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'without .agent-room.json to say otherwise, missing principles.md must still be an error');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: fails when guardrails.json scopeBoundaries has invalid structure', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-scope-invalid-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'ScopeRoom', force: true });
  const guardrailsPath = path.join(tmpDir, '.agent-room', 'guardrails.json');
  const guardrails = JSON.parse(fs.readFileSync(guardrailsPath, 'utf8'));
  guardrails.scopeBoundaries = {
    allowedPaths: 'not-an-array',
    disallowedCrossBoundaries: [['only-one-item']]
  };
  fs.writeFileSync(guardrailsPath, JSON.stringify(guardrails, null, 2));

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'invalid scopeBoundaries should fail validate');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: fails when guardrails.json importBoundaries has invalid structure', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-import-invalid-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'ImportInvalidRoom', force: true });
  const guardrailsPath = path.join(tmpDir, '.agent-room', 'guardrails.json');
  const guardrails = JSON.parse(fs.readFileSync(guardrailsPath, 'utf8'));
  guardrails.importBoundaries = [
    {
      source: '',
      disallowed: []
    }
  ];
  fs.writeFileSync(guardrailsPath, JSON.stringify(guardrails, null, 2));

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'invalid importBoundaries should fail validate');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: passes on a cleanly scaffolded strict-preset room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-strict-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'StrictCleanRoom', preset: 'strict', force: true });

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, undefined, 'strict room should pass validation with no errors');
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('runValidate: fails when hooks.prePush in .agent-room.json has invalid types', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-validate-hooks-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'HooksInvalidRoom', force: true });
  const configPath = path.join(tmpDir, '.agent-room.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.hooks = {
    prePush: {
      enabled: 'not-a-boolean',
      strict: 123,
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    runValidate(tmpDir);
    assert.strictEqual(process.exitCode, 1, 'invalid hooks.prePush types should fail validate');
  } finally {
    process.exitCode = originalExitCode;
  }
});

