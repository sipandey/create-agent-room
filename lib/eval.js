'use strict';

const fs = require('fs');
const path = require('path');
const { collectFindings } = require('./checks');
const { validateMarkdownSession } = require('./lint-sessions');
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
    cases.push(...discoverCasesInDir(path.join(BUILTIN_EVALS_ROOT, suite), suite));
  }
  return cases;
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
    default:
      outcome = { passed: false, error: `unknown case type: ${spec.type}` };
  }
  return {
    suite: spec.suite,
    id: spec.id,
    description: spec.description || '',
    expected: spec.expect,
    passed: outcome.passed,
    durationMs: Date.now() - start,
    error: outcome.error || null,
  };
}

function runEval(args) {
  args = args || {};
  const cases = loadBuiltinCases(args.suite);
  const results = cases.map((spec) => runEvalCase(spec));
  const passed = results.filter((r) => r.passed).length;
  return {
    toolVersion: require('../package.json').version,
    ranAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
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
    const header = 'suite,id,description,passed,expected,duration_ms,error';
    const rows = report.cases.map((c) =>
      [
        escapeCsv(c.suite),
        escapeCsv(c.id),
        escapeCsv(c.description),
        escapeCsv(c.passed),
        escapeCsv(c.expected),
        escapeCsv(c.durationMs),
        escapeCsv(c.error),
      ].join(',')
    );
    return [header, ...rows].join('\n') + '\n';
  }

  const lines = [];
  lines.push(
    bold(
      `Compliance evals — ${report.summary.passed}/${report.summary.total} passed` +
        (report.summary.failed > 0 ? red(` (${report.summary.failed} failed)`) : green(''))
    )
  );
  lines.push('');
  let currentSuite = null;
  for (const c of report.cases) {
    if (c.suite !== currentSuite) {
      currentSuite = c.suite;
      lines.push(bold(cyan(currentSuite)));
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

function runEvalCli(args) {
  const format = (args.format || 'text').toLowerCase();
  if (!['text', 'json', 'csv'].includes(format)) {
    throw new Error(`Unknown --format: ${args.format}. Use text, json, or csv.`);
  }

  const report = runEval({ suite: args.suite });
  const output = formatEvalReport(report, format);

  if (args.output) {
    fs.writeFileSync(path.resolve(args.output), output);
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
  runEvalCase,
  runEval,
  formatEvalReport,
  runEvalCli,
};
