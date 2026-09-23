'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { collectFindings } = require('./checks');
const { validateMarkdownSession } = require('./lint-sessions');
const { verifyProject } = require('./verify');
const { bold, green, red, cyan } = require('./color');

const BUILTIN_EVALS_ROOT = path.join(__dirname, '..', 'evals', 'builtin');
const HOOK_SRC = path.join(
  __dirname,
  '..',
  'templates',
  'adapters',
  'claude-hooks',
  'close-the-loop-check.js'
);

function loadCheckClosingTheLoop() {
  delete require.cache[require.resolve(HOOK_SRC)];
  return require(HOOK_SRC).checkClosingTheLoop;
}

function readCaseJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function discoverCasesInDir(dir, suiteName) {
  const cases = [];
  if (!fs.existsSync(dir)) return cases;

  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry.endsWith('.eval.json') && fs.statSync(full).isFile()) {
      const spec = readCaseJson(full);
      cases.push({ ...spec, _casePath: full });
      continue;
    }
    if (!fs.statSync(full).isDirectory()) continue;
    const evalJson = path.join(full, 'eval.json');
    if (!fs.existsSync(evalJson)) continue;
    const spec = readCaseJson(evalJson);
    cases.push({
      ...spec,
      suite: spec.suite || suiteName,
      fixtureDir: full,
      _casePath: evalJson,
    });
  }

  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

function loadBuiltinCases(suiteFilter) {
  const filter = suiteFilter && suiteFilter !== 'all' ? suiteFilter : null;
  const suites = filter ? [filter] : ['close-the-loop', 'lint-sessions', 'validate'];
  const cases = [];
  for (const suite of suites) {
    const suiteCases = discoverCasesInDir(path.join(BUILTIN_EVALS_ROOT, suite), suite);
    for (const c of suiteCases) {
      cases.push({ ...c, source: 'builtin' });
    }
  }
  return cases;
}

function loadCustomCases(target, opts = {}) {
  const customDirs = [];
  if (opts.evalsDir) {
    customDirs.push(path.resolve(opts.evalsDir));
  } else if (opts.customEvals) {
    customDirs.push(path.resolve(opts.customEvals));
  } else {
    if (target) {
      customDirs.push(path.join(target, '.agent-room', 'evals'));
      customDirs.push(path.join(target, 'evals', 'custom'));
    }
    const cwd = process.cwd();
    if (cwd !== target) {
      customDirs.push(path.join(cwd, '.agent-room', 'evals'));
      customDirs.push(path.join(cwd, 'evals', 'custom'));
    }
  }

  const seenPaths = new Set();
  const cases = [];

  for (const dir of customDirs) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (seenPaths.has(full)) continue;

      if (entry.endsWith('.eval.json') && fs.statSync(full).isFile()) {
        try {
          const spec = readCaseJson(full);
          seenPaths.add(full);
          cases.push({
            ...spec,
            suite: spec.suite || path.basename(dir),
            source: 'custom',
            _casePath: full,
          });
        } catch (_) {
          // ignore unparseable custom eval specs
        }
        continue;
      }

      if (fs.statSync(full).isDirectory()) {
        const evalJson = path.join(full, 'eval.json');
        if (fs.existsSync(evalJson)) {
          try {
            const spec = readCaseJson(evalJson);
            seenPaths.add(evalJson);
            cases.push({
              ...spec,
              suite: spec.suite || entry,
              fixtureDir: full,
              source: 'custom',
              _casePath: evalJson,
            });
          } catch (_) {
            // ignore unparseable custom eval specs
          }
          continue;
        }

        // Subdirectory containing multiple eval cases
        const subCases = discoverCasesInDir(full, entry);
        for (const sc of subCases) {
          if (!seenPaths.has(sc._casePath)) {
            seenPaths.add(sc._casePath);
            cases.push({
              ...sc,
              suite: sc.suite || entry,
              source: 'custom',
            });
          }
        }
      }
    }
  }

  return cases.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
}

function expectPass(spec) {
  return spec.expect === 'pass';
}

function runCloseTheLoopCase(spec) {
  const checkClosingTheLoop = loadCheckClosingTheLoop();
  const result = checkClosingTheLoop('/tmp/eval-unused', spec.input || {});
  const passed = expectPass(spec) ? result.ok === true : result.ok === false;
  let error = null;
  if (!passed) {
    error = expectPass(spec)
      ? `expected ok=true, got ok=${result.ok}`
      : `expected ok=false, got ok=${result.ok}`;
  }
  if (passed && spec.assert && spec.assert.reason && result.reason !== spec.assert.reason) {
    return {
      passed: false,
      error: `expected reason=${spec.assert.reason}, got ${result.reason}`,
    };
  }
  return { passed, error };
}

function runLintSessionsCase(spec) {
  const sessionsDir = path.join(spec.fixtureDir, '.agent-room', 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    return { passed: false, error: 'missing .agent-room/sessions in fixture' };
  }
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    return { passed: false, error: 'no session .md files in fixture' };
  }
  let anyErrors = false;
  for (const file of files) {
    const result = validateMarkdownSession(path.join(sessionsDir, file), file);
    if (result.errors.length > 0) anyErrors = true;
  }
  const passed = expectPass(spec) ? !anyErrors : anyErrors;
  return {
    passed,
    error: passed
      ? null
      : expectPass(spec)
        ? 'expected no lint errors'
        : 'expected lint errors',
  };
}

function runValidateCase(spec) {
  const { errors } = collectFindings(spec.fixtureDir);
  const hasErrors = errors.length > 0;
  const passed = expectPass(spec) ? !hasErrors : hasErrors;
  return {
    passed,
    error: passed
      ? null
      : expectPass(spec)
        ? `expected no validate errors, got: ${errors.join('; ')}`
        : 'expected validate errors',
  };
}

function runVerifyCase(spec) {
  const targetDir = spec.fixtureDir || spec.targetDir || '/tmp/eval-unused';
  const result = verifyProject(targetDir, spec.options || {});
  const passed = expectPass(spec) ? result.ok === true : result.ok === false;
  let error = null;
  if (!passed) {
    error = expectPass(spec)
      ? `expected verify ok=true, got ok=${result.ok}${result.output ? ` (${result.output.trim()})` : ''}`
      : `expected verify ok=false, got ok=${result.ok}`;
  }
  return { passed, error };
}

function runCommandCase(spec) {
  if (!spec.command) {
    return { passed: false, error: 'missing command in spec' };
  }
  const cwd = spec.fixtureDir || spec.cwd || process.cwd();
  const timeoutMs = spec.timeout || 30000;
  let res;
  try {
    res = spawnSync(spec.command, {
      cwd,
      shell: true,
      timeout: timeoutMs,
      encoding: 'utf8',
    });
  } catch (err) {
    res = { status: 1, stderr: err.message };
  }

  const exitCode = res.status !== null && res.status !== undefined ? res.status : 1;
  const passed = expectPass(spec) ? exitCode === 0 : exitCode !== 0;
  let error = null;
  if (!passed) {
    const out = [(res.stdout || ''), (res.stderr || '')].filter(Boolean).join('\n').trim();
    error = expectPass(spec)
      ? `command "${spec.command}" failed with exit code ${exitCode}${out ? `: ${out}` : ''}`
      : `command "${spec.command}" succeeded with exit code 0 but expected failure`;
  }
  return { passed, error };
}

function runEvalCase(spec) {
  const start = Date.now();
  let outcome;
  switch (spec.type) {
    case 'close-the-loop':
      outcome = runCloseTheLoopCase(spec);
      break;
    case 'lint-sessions':
      outcome = runLintSessionsCase(spec);
      break;
    case 'validate':
      outcome = runValidateCase(spec);
      break;
    case 'verify':
      outcome = runVerifyCase(spec);
      break;
    case 'command':
      outcome = runCommandCase(spec);
      break;
    default:
      outcome = { passed: false, error: `unknown case type: ${spec.type}` };
  }
  return {
    suite: spec.suite,
    id: spec.id,
    description: spec.description || '',
    expected: spec.expect,
    source: spec.source || 'builtin',
    passed: outcome.passed,
    durationMs: Date.now() - start,
    error: outcome.error || null,
  };
}

function runEval(args = {}) {
  const target = args.target ? path.resolve(args.target) : process.cwd();
  const suiteFilter = args.suite && args.suite !== 'all' ? args.suite : null;

  const allCases = [];

  // Load builtins unless customOnly is requested
  if (!args.customOnly) {
    const builtinCases = loadBuiltinCases(suiteFilter);
    allCases.push(...builtinCases);
  }

  // Load custom cases unless builtinOnly is requested
  if (!args.builtinOnly) {
    const customCases = loadCustomCases(target, args);
    const filteredCustom = suiteFilter
      ? customCases.filter((c) => c.suite === suiteFilter)
      : customCases;
    allCases.push(...filteredCustom);
  }

  const results = allCases.map((spec) => runEvalCase(spec));
  const passed = results.filter((r) => r.passed).length;

  const builtinResults = results.filter((r) => r.source === 'builtin');
  const customResults = results.filter((r) => r.source === 'custom');

  return {
    toolVersion: require('../package.json').version,
    ranAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      builtin: {
        total: builtinResults.length,
        passed: builtinResults.filter((r) => r.passed).length,
        failed: builtinResults.filter((r) => !r.passed).length,
      },
      custom: {
        total: customResults.length,
        passed: customResults.filter((r) => r.passed).length,
        failed: customResults.filter((r) => !r.passed).length,
      },
    },
    cases: results,
  };
}

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function formatEvalReport(report, format) {
  if (format === 'json') {
    return JSON.stringify(report, null, 2) + '\n';
  }
  if (format === 'csv') {
    const header = 'suite,id,description,source,passed,expected,duration_ms,error';
    const rows = report.cases.map((c) =>
      [
        escapeCsv(c.suite),
        escapeCsv(c.id),
        escapeCsv(c.description),
        escapeCsv(c.source || 'builtin'),
        escapeCsv(c.passed),
        escapeCsv(c.expected),
        escapeCsv(c.durationMs),
        escapeCsv(c.error),
      ].join(',')
    );
    return [header, ...rows].join('\n') + '\n';
  }

  const lines = [];
  const s = report.summary;
  let summaryLine = `Compliance evals — ${s.passed}/${s.total} passed`;
  if (s.custom && s.custom.total > 0) {
    summaryLine += ` (${s.builtin.passed}/${s.builtin.total} builtin, ${s.custom.passed}/${s.custom.total} custom)`;
  }
  if (s.failed > 0) {
    summaryLine += red(` (${s.failed} failed)`);
  }
  lines.push(bold(summaryLine));
  lines.push('');

  let currentSuite = null;
  for (const c of report.cases) {
    if (c.suite !== currentSuite) {
      currentSuite = c.suite;
      const tag = c.source === 'custom' ? ' (custom)' : '';
      lines.push(bold(cyan(currentSuite + tag)));
    }
    const mark = c.passed ? green('✓') : red('✗');
    lines.push(`  ${mark} ${c.id}${c.description ? ` — ${c.description}` : ''}`);
    if (!c.passed && c.error) {
      lines.push(red(`      ${c.error}`));
    }
  }
  lines.push('');
  return lines.join('\n');
}

function runEvalCli(targetOrArgs, maybeArgs) {
  let target = process.cwd();
  let args = {};

  if (typeof targetOrArgs === 'string') {
    target = targetOrArgs;
    args = maybeArgs || {};
  } else if (targetOrArgs && typeof targetOrArgs === 'object') {
    args = targetOrArgs;
    if (args._ && args._[0]) {
      target = path.resolve(args._[0]);
    }
  }

  const format = (args.format || 'text').toLowerCase();
  if (!['text', 'json', 'csv'].includes(format)) {
    throw new Error(`Unknown --format: ${args.format}. Use text, json, or csv.`);
  }

  const report = runEval({
    target,
    suite: args.suite,
    evalsDir: args['evals-dir'] || args.evalsDir || args['custom-evals'] || args.customEvals,
    customOnly: args['custom-only'] || args.customOnly,
    builtinOnly: args['builtin-only'] || args.builtinOnly,
  });
  const output = formatEvalReport(report, format);

  if (args.output) {
    const dest = path.resolve(args.output);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, output);
    if (format === 'text') {
      console.log(output);
    }
  } else if (format === 'text') {
    console.log(output);
  } else {
    process.stdout.write(output);
  }

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  BUILTIN_EVALS_ROOT,
  loadBuiltinCases,
  loadCustomCases,
  runEvalCase,
  runVerifyCase,
  runCommandCase,
  runEval,
  formatEvalReport,
  runEvalCli,
};
