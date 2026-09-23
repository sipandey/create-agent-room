'use strict';

const fs = require('fs');
const path = require('path');
const { collectFindings } = require('./checks');
const { getFindings } = require('./doctor');
const { lintSessions } = require('./lint-sessions');
const { verifyProject } = require('./verify');
const { runEval } = require('./eval');
const { auditPullRequest } = require('./pr-audit');
const { bold, green, red, yellow, cyan, gray } = require('./color');
const { version: CAR_VERSION } = require('../package.json');

const AVAILABLE_CHECKS = ['validate', 'doctor', 'sessions', 'verify', 'eval', 'pr'];

function resolveChecksToRun(options) {
  options = options || {};

  // Check if --only-* or --only is used
  const onlyList = [];
  if (options.only) {
    const list = Array.isArray(options.only) ? options.only : String(options.only).split(',');
    for (const item of list) {
      const normalized = item.trim().toLowerCase();
      if (normalized === 'lint-sessions' || normalized === 'session') {
        onlyList.push('sessions');
      } else if (normalized === 'pr-audit' || normalized === 'pr') {
        onlyList.push('pr');
      } else if (AVAILABLE_CHECKS.includes(normalized)) {
        onlyList.push(normalized);
      }
    }
  }

  for (const check of AVAILABLE_CHECKS) {
    const key = `only${check.charAt(0).toUpperCase() + check.slice(1)}`;
    const dashed = `only-${check}`;
    if (options[key] || options[dashed]) {
      onlyList.push(check);
    }
  }
  if (options.onlySessions || options['only-sessions'] || options['only-lint-sessions']) {
    if (!onlyList.includes('sessions')) onlyList.push('sessions');
  }
  if (options.onlyPrAudit || options['only-pr-audit']) {
    if (!onlyList.includes('pr')) onlyList.push('pr');
  }

  if (onlyList.length > 0) {
    return AVAILABLE_CHECKS.filter((c) => onlyList.includes(c));
  }

  // Otherwise, run all except skipped
  return AVAILABLE_CHECKS.filter((check) => {
    const skipKey = `skip${check.charAt(0).toUpperCase() + check.slice(1)}`;
    const skipDashed = `skip-${check}`;
    if (options[skipKey] || options[skipDashed]) {
      return false;
    }
    if (check === 'sessions' && (options.skipSessions || options['skip-sessions'] || options['skip-lint-sessions'])) {
      return false;
    }
    if (check === 'pr' && (options.skipPrAudit || options['skip-pr-audit'])) {
      return false;
    }
    return true;
  });
}

function runCi(target, options) {
  options = options || {};
  target = path.resolve(target || '.');

  const startTotal = Date.now();
  const checksToRun = resolveChecksToRun(options);
  const strict = Boolean(options.strict);

  const report = {
    ok: true,
    version: CAR_VERSION,
    target,
    strict,
    timestamp: new Date().toISOString(),
    durationMs: 0,
    checks: {},
    summary: {
      total: AVAILABLE_CHECKS.length,
      executed: checksToRun.length,
      passed: 0,
      failed: 0,
      skipped: AVAILABLE_CHECKS.length - checksToRun.length,
    },
  };

  // 1. validate
  if (checksToRun.includes('validate')) {
    const t0 = Date.now();
    try {
      const findings = collectFindings(target);
      const durationMs = Date.now() - t0;
      const ok = findings.errors.length === 0 && (!strict || findings.warnings.length === 0);
      report.checks.validate = {
        ok,
        skipped: false,
        durationMs,
        errors: findings.errors,
        warnings: findings.warnings,
      };
      if (ok) report.summary.passed++;
      else {
        report.summary.failed++;
        report.ok = false;
      }
    } catch (err) {
      report.checks.validate = {
        ok: false,
        skipped: false,
        durationMs: Date.now() - t0,
        errors: [err.message],
        warnings: [],
      };
      report.summary.failed++;
      report.ok = false;
    }
  } else {
    report.checks.validate = { ok: true, skipped: true, durationMs: 0, errors: [], warnings: [] };
  }

  // 2. doctor
  if (checksToRun.includes('doctor')) {
    const t0 = Date.now();
    try {
      const findings = getFindings(target);
      const durationMs = Date.now() - t0;
      const ok = findings.critical.length === 0 && (!strict || findings.advisory.length === 0);
      report.checks.doctor = {
        ok,
        skipped: false,
        durationMs,
        critical: findings.critical,
        advisory: findings.advisory,
        isMinimalProfile: findings.isMinimalProfile,
      };
      if (ok) report.summary.passed++;
      else {
        report.summary.failed++;
        report.ok = false;
      }
    } catch (err) {
      report.checks.doctor = {
        ok: false,
        skipped: false,
        durationMs: Date.now() - t0,
        critical: [err.message],
        advisory: [],
      };
      report.summary.failed++;
      report.ok = false;
    }
  } else {
    report.checks.doctor = { ok: true, skipped: true, durationMs: 0, critical: [], advisory: [] };
  }

  // 3. sessions
  if (checksToRun.includes('sessions')) {
    const t0 = Date.now();
    try {
      const result = lintSessions(target);
      const durationMs = Date.now() - t0;
      const ok = result.totalErrors === 0 && (!strict || result.totalWarnings === 0);
      report.checks.sessions = {
        ok,
        skipped: false,
        durationMs,
        filesScanned: result.filesScanned,
        errors: result.errors,
        warnings: result.warnings,
      };
      if (ok) report.summary.passed++;
      else {
        report.summary.failed++;
        report.ok = false;
      }
    } catch (err) {
      report.checks.sessions = {
        ok: false,
        skipped: false,
        durationMs: Date.now() - t0,
        filesScanned: 0,
        errors: [err.message],
        warnings: [],
      };
      report.summary.failed++;
      report.ok = false;
    }
  } else {
    report.checks.sessions = { ok: true, skipped: true, durationMs: 0, filesScanned: 0, errors: [], warnings: [] };
  }

  // 4. verify
  if (checksToRun.includes('verify')) {
    const t0 = Date.now();
    try {
      const result = verifyProject(target, {
        strict,
        testCommand: options.testCommand || options['test-command'],
        timeout: options.timeout,
      });
      const durationMs = result.durationMs !== undefined ? result.durationMs : Date.now() - t0;
      const ok = result.ok;
      report.checks.verify = {
        ok,
        skipped: Boolean(result.skipped),
        durationMs,
        command: result.command,
        exitCode: result.exitCode,
        output: result.output,
        reason: result.reason,
      };
      if (ok) report.summary.passed++;
      else {
        report.summary.failed++;
        report.ok = false;
      }
    } catch (err) {
      report.checks.verify = {
        ok: false,
        skipped: false,
        durationMs: Date.now() - t0,
        command: null,
        exitCode: 1,
        output: err.message,
        reason: 'exception',
      };
      report.summary.failed++;
      report.ok = false;
    }
  } else {
    report.checks.verify = { ok: true, skipped: true, durationMs: 0, command: null, exitCode: 0, output: '' };
  }

  // 5. eval
  if (checksToRun.includes('eval')) {
    const t0 = Date.now();
    try {
      const evalReport = runEval({
        target,
        suite: options.suite,
        evalsDir: options.evalsDir || options['evals-dir'] || options.customEvals || options['custom-evals'],
        customOnly: options.customOnly || options['custom-only'],
        builtinOnly: options.builtinOnly || options['builtin-only'],
      });
      const durationMs = Date.now() - t0;
      const ok = evalReport.summary.failed === 0;
      report.checks.eval = {
        ok,
        skipped: false,
        durationMs,
        passedCount: evalReport.summary.passed,
        failedCount: evalReport.summary.failed,
        total: evalReport.summary.total,
        cases: evalReport.cases.filter((c) => !c.passed),
      };
      if (ok) report.summary.passed++;
      else {
        report.summary.failed++;
        report.ok = false;
      }
    } catch (err) {
      report.checks.eval = {
        ok: false,
        skipped: false,
        durationMs: Date.now() - t0,
        passedCount: 0,
        failedCount: 1,
        total: 1,
        cases: [{ id: 'eval-runner', error: err.message, passed: false }],
      };
      report.summary.failed++;
      report.ok = false;
    }
  } else {
    report.checks.eval = { ok: true, skipped: true, durationMs: 0, passedCount: 0, failedCount: 0, total: 0, cases: [] };
  }

  // 6. pr
  if (checksToRun.includes('pr')) {
    const t0 = Date.now();
    try {
      const prResult = auditPullRequest(target, {
        base: options.base || options['base-ref'] || options.baseRef,
        strict,
        skipPrSessions: options.skipPrSessions || options['skip-pr-sessions'],
      });
      report.checks.pr = prResult;
      if (prResult.ok) {
        report.summary.passed++;
      } else {
        report.summary.failed++;
        report.ok = false;
      }
    } catch (err) {
      report.checks.pr = {
        ok: false,
        skipped: false,
        durationMs: Date.now() - t0,
        baseRef: options.base || null,
        mergeBase: null,
        antiTamper: { ok: false, deleted: false, weakened: false, authorized: false, violations: [] },
        bypassAudit: { ok: false, newEntriesCount: 0, violations: [] },
        sessionAudit: { ok: false, required: false, sessionsFound: [], violations: [] },
        errors: [err.message],
        warnings: [],
      };
      report.summary.failed++;
      report.ok = false;
    }
  } else {
    report.checks.pr = {
      ok: true,
      skipped: true,
      durationMs: 0,
      baseRef: null,
      mergeBase: null,
      antiTamper: { ok: true, deleted: false, weakened: false, authorized: false, violations: [] },
      bypassAudit: { ok: true, newEntriesCount: 0, violations: [] },
      sessionAudit: { ok: true, required: false, sessionsFound: [], violations: [] },
      errors: [],
      warnings: [],
    };
  }

  report.durationMs = Date.now() - startTotal;
  return report;
}

function formatCiReport(report, format) {
  format = (format || 'text').toLowerCase();

  if (format === 'json') {
    return JSON.stringify(report, null, 2) + '\n';
  }

  if (format === 'markdown') {
    const lines = [];
    const statusIcon = report.ok ? '✅' : '❌';
    const statusText = report.ok ? 'PASSED' : 'FAILED';
    lines.push(`## 🛡️ Agent-Room CI Status: ${statusText} ${statusIcon}`);
    lines.push('');
    lines.push(`**Repository:** \`${path.basename(report.target)}\` | **Duration:** ${report.durationMs}ms | **Strict Mode:** \`${report.strict}\``);
    lines.push('');
    lines.push('| Stage | Status | Duration | Summary |');
    lines.push('| :--- | :---: | :---: | :--- |');

    // validate row
    const val = report.checks.validate;
    if (val.skipped) {
      lines.push('| **Structure & Guardrails** | ⚪ Skipped | — | Stage was skipped |');
    } else if (val.ok) {
      lines.push(`| **Structure & Guardrails** | ✅ Pass | ${val.durationMs}ms | Guardrails schema and files valid |`);
    } else {
      lines.push(`| **Structure & Guardrails** | ❌ Fail | ${val.durationMs}ms | ${val.errors.length} error(s) detected |`);
    }

    // doctor row
    const doc = report.checks.doctor;
    if (doc.skipped) {
      lines.push('| **Hook & Template Sync** | ⚪ Skipped | — | Stage was skipped |');
    } else if (doc.ok) {
      lines.push(`| **Hook & Template Sync** | ✅ Pass | ${doc.durationMs}ms | All hooks, stops, and CI pins synchronized |`);
    } else {
      lines.push(`| **Hook & Template Sync** | ❌ Fail | ${doc.durationMs}ms | ${doc.critical.length} critical finding(s) |`);
    }

    // sessions row
    const ses = report.checks.sessions;
    if (ses.skipped) {
      lines.push('| **Session Log Linter** | ⚪ Skipped | — | Stage was skipped |');
    } else if (ses.ok) {
      lines.push(`| **Session Log Linter** | ✅ Pass | ${ses.durationMs}ms | ${ses.filesScanned} session(s) verified |`);
    } else {
      lines.push(`| **Session Log Linter** | ❌ Fail | ${ses.durationMs}ms | ${ses.errors.length} lint error(s) |`);
    }

    // verify row
    const ver = report.checks.verify;
    if (ver.skipped) {
      lines.push('| **Code Verification** | ⚪ Skipped | — | No command or stage skipped |');
    } else if (ver.ok) {
      lines.push(`| **Code Verification** | ✅ Pass | ${ver.durationMs}ms | \`${ver.command || 'test'}\` passed |`);
    } else {
      lines.push(`| **Code Verification** | ❌ Fail | ${ver.durationMs}ms | Test execution exited code ${ver.exitCode} |`);
    }

    // eval row
    const ev = report.checks.eval;
    if (ev.skipped) {
      lines.push('| **Compliance Evals** | ⚪ Skipped | — | Stage was skipped |');
    } else if (ev.ok) {
      lines.push(`| **Compliance Evals** | ✅ Pass | ${ev.durationMs}ms | ${ev.passedCount}/${ev.total} eval suites passed |`);
    } else {
      lines.push(`| **Compliance Evals** | ❌ Fail | ${ev.durationMs}ms | ${ev.failedCount} eval failure(s) |`);
    }

    // pr row
    const pr = report.checks.pr;
    if (pr) {
      if (pr.skipped) {
        lines.push('| **PR Anti-Tamper & Bypass** | ⚪ Skipped | — | No base ref or stage skipped |');
      } else if (pr.ok) {
        const summary = pr.antiTamper?.authorized
          ? `Audit passed (${pr.bypassAudit?.newEntriesCount || 0} authorized bypass)`
          : `Verified against \`${pr.baseRef}\``;
        lines.push(`| **PR Anti-Tamper & Bypass** | ✅ Pass | ${pr.durationMs}ms | ${summary} |`);
      } else {
        const errCount = pr.errors?.length || 0;
        lines.push(`| **PR Anti-Tamper & Bypass** | ❌ Fail | ${pr.durationMs}ms | ${errCount} audit violation(s) against \`${pr.baseRef}\` |`);
      }
    }

    lines.push('');

    // Detailed failure section if any
    if (!report.ok) {
      lines.push('### ⚠️ Failure Diagnostics');
      lines.push('');

      if (!val.ok && val.errors.length > 0) {
        lines.push('<details><summary><b>Structure & Guardrails Errors</b></summary>');
        lines.push('');
        for (const e of val.errors) lines.push(`- ❌ ${e}`);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }

      if (!doc.ok && doc.critical.length > 0) {
        lines.push('<details><summary><b>Doctor Findings</b></summary>');
        lines.push('');
        for (const c of doc.critical) lines.push(`- 🔴 ${c}`);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }

      if (!ses.ok && ses.errors.length > 0) {
        lines.push('<details><summary><b>Session Lint Errors</b></summary>');
        lines.push('');
        for (const e of ses.errors) lines.push(`- ❌ ${e}`);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }

      if (!ver.ok) {
        lines.push('<details><summary><b>Verification Test Output</b></summary>');
        lines.push('');
        lines.push('```');
        lines.push(ver.output || 'No output recorded');
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }

      if (!ev.ok && ev.cases.length > 0) {
        lines.push('<details><summary><b>Compliance Eval Failures</b></summary>');
        lines.push('');
        for (const c of ev.cases) {
          lines.push(`- ❌ \`${c.id}\`: ${c.error || 'Check failed'}`);
        }
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }

      if (pr && !pr.ok && pr.errors && pr.errors.length > 0) {
        lines.push('<details><summary><b>PR Anti-Tamper & Bypass Violations</b></summary>');
        lines.push('');
        for (const e of pr.errors) lines.push(`- ❌ ${e}`);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    }

    lines.push(`*Generated by [create-agent-room](https://github.com/sipandey/create-agent-room) v${report.version}*`);
    lines.push('');
    return lines.join('\n');
  }

  // Default 'text'
  const lines = [];
  lines.push(bold('======================================================'));
  lines.push(bold(`create-agent-room CI Runner v${report.version}`));
  lines.push(`Target: ${cyan(report.target)}`);
  if (report.strict) lines.push(yellow('Mode:   Strict'));
  lines.push(bold('======================================================\n'));

  function formatStatus(checkName, checkObj, successText, failText) {
    const padName = checkName.padEnd(14, ' ');
    if (checkObj.skipped) {
      lines.push(`  ${gray('⚪')} ${padName} ${gray('Skipped')}`);
      return;
    }
    if (checkObj.ok) {
      lines.push(`  ${green('✓')} ${padName} ${successText} ${gray(`(${checkObj.durationMs}ms)`)}`);
    } else {
      lines.push(`  ${red('✗')} ${padName} ${red(failText)} ${gray(`(${checkObj.durationMs}ms)`)}`);
    }
  }

  const v = report.checks.validate;
  formatStatus('validate', v, 'Structure and guardrails schema valid', `${v.errors.length} validation error(s)`);
  if (!v.skipped && !v.ok) {
    for (const e of v.errors) lines.push(red(`      ❌ ${e}`));
  }
  if (!v.skipped && v.warnings.length > 0) {
    for (const w of v.warnings) lines.push(yellow(`      ⚠️  ${w}`));
  }

  const d = report.checks.doctor;
  formatStatus('doctor', d, 'All hooks, stops, and CI pins in sync', `${d.critical.length} critical finding(s)`);
  if (!d.skipped && !d.ok) {
    for (const c of d.critical) lines.push(red(`      🔴 ${c}`));
  }
  if (!d.skipped && d.advisory.length > 0) {
    for (const a of d.advisory) lines.push(yellow(`      🟡 ${a}`));
  }

  const s = report.checks.sessions;
  formatStatus('lint-sessions', s, `${s.filesScanned} session log(s) valid`, `${s.errors.length} lint error(s)`);
  if (!s.skipped && !s.ok) {
    for (const e of s.errors) lines.push(red(`      ❌ ${e}`));
  }

  const ver = report.checks.verify;
  const verSuccess = ver.command ? `Test suite "${ver.command}" passed` : 'Verification test passed';
  const verFail = ver.command ? `Test suite "${ver.command}" failed (code ${ver.exitCode})` : (ver.reason || 'Verification failed');
  formatStatus('verify', ver, verSuccess, verFail);
  if (!ver.skipped && !ver.ok && ver.output) {
    const preview = ver.output.trim().split('\n').slice(-5).join('\n');
    lines.push(red(`      Output tail:\n${preview.replace(/^/gm, '        ')}`));
  }

  const ev = report.checks.eval;
  formatStatus('eval', ev, `Compliance evals ${ev.passedCount}/${ev.total} passed`, `${ev.failedCount} eval(s) failed`);
  if (!ev.skipped && !ev.ok) {
    for (const c of ev.cases) {
      lines.push(red(`      ❌ ${c.id}: ${c.error || 'Failed'}`));
    }
  }

  const p = report.checks.pr;
  if (p) {
    const prSuccess = p.skipped
      ? 'No PR base ref detected or stage skipped'
      : p.antiTamper?.authorized
        ? `Verified against ${p.baseRef} (authorized bypass)`
        : `Diff against ${p.baseRef} verified`;
    const prFail = p.errors?.length ? `${p.errors.length} PR audit violation(s)` : 'PR audit failed';
    formatStatus('pr-audit', p, prSuccess, prFail);
    if (!p.skipped && !p.ok && p.errors) {
      for (const e of p.errors) lines.push(red(`      ❌ ${e}`));
    }
    if (!p.skipped && p.warnings && p.warnings.length > 0) {
      for (const w of p.warnings) lines.push(yellow(`      ⚠️  ${w}`));
    }
  }

  lines.push('');
  lines.push('------------------------------------------------------');
  const sText = `${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`;
  if (report.ok) {
    lines.push(bold(green(`Result: PASSED (${sText}) in ${report.durationMs}ms`)));
  } else {
    lines.push(bold(red(`Result: FAILED (${sText}) in ${report.durationMs}ms`)));
  }
  lines.push('======================================================\n');

  return lines.join('\n');
}

function runCiCli(target, args) {
  args = args || {};
  target = path.resolve(target || args._?.[0] || '.');

  const report = runCi(target, args);
  const format = (args.format || 'text').toLowerCase();
  const output = formatCiReport(report, format);

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

  // Handle GitHub Actions Step Summary if requested or environment available
  const stepSummaryFile = args.summary
    ? (typeof args.summary === 'string' ? path.resolve(args.summary) : process.env.GITHUB_STEP_SUMMARY)
    : process.env.GITHUB_STEP_SUMMARY;

  if (stepSummaryFile && (args.summary || process.env.GITHUB_STEP_SUMMARY)) {
    try {
      const markdown = formatCiReport(report, 'markdown');
      fs.appendFileSync(stepSummaryFile, markdown + '\n');
    } catch (err) {
      // Step summary append is non-fatal
    }
  }

  if (!report.ok) {
    process.exitCode = 1;
    return 1;
  }
  return 0;
}

module.exports = {
  AVAILABLE_CHECKS,
  resolveChecksToRun,
  runCi,
  formatCiReport,
  runCiCli,
};
