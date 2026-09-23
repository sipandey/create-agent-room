'use strict';

const fs = require('fs');
const path = require('path');
const { green, yellow, red, cyan, bold } = require('./color');

function countFiles(str) {
  if (!str) return 0;
  const clean = str.trim().replace(/\[|\]/g, '');
  if (/^(none|blank|n\/a|list of.*|placeholder)$/i.test(clean)) return 0;
  const items = clean.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length;
}

function parseFileList(val) {
  if (Array.isArray(val)) return val.length;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return countFiles(val);
  return 0;
}

function parseMarkdownSession(filePath, stats) {
  const content = fs.readFileSync(filePath, 'utf8');
  stats.total++;

  // Regex matches
  const agentMatch = content.match(/\*\*Agent:\*\*\s*(.+)/i);
  const classMatch = content.match(/\*\*Classification:\*\*\s*(.+)/i);

  // Parse Outcome
  let outcome = 'Handed Off';
  const outcomeHeaderMatch = content.match(/## Outcome\s*\n+([^\n#\s]+[^\n#]*)/i);
  if (outcomeHeaderMatch) {
    const parsed = outcomeHeaderMatch[1].trim();
    if (/completed/i.test(parsed)) outcome = 'Completed';
    else if (/blocked/i.test(parsed)) outcome = 'Blocked';
    else if (/handed/i.test(parsed)) outcome = 'Handed Off';
  }
  if (stats.outcomes && stats.outcomes[outcome] !== undefined) {
    stats.outcomes[outcome]++;
  }

  if (classMatch && stats.classifications) {
    const val = classMatch[1].trim();
    let matchedClass = null;
    if (/bug/i.test(val)) matchedClass = 'Bug';
    else if (/enhancement/i.test(val)) matchedClass = 'Enhancement';
    else if (/feature/i.test(val)) matchedClass = 'Feature';
    else if (/product/i.test(val)) matchedClass = 'Product';

    if (matchedClass && stats.classifications[matchedClass] !== undefined) {
      stats.classifications[matchedClass]++;
    }
  }

  if (agentMatch && stats.agents) {
    const agent = agentMatch[1].trim().replace(/\[|\]/g, '');
    stats.agents[agent] = (stats.agents[agent] || 0) + 1;
  }

  // Parse Files touched
  const readMatch = content.match(/-\s*Read:\s*(.+)/i);
  const createdMatch = content.match(/-\s*Created:\s*(.+)/i);
  const modifiedMatch = content.match(/-\s*Modified:\s*(.+)/i);

  if (readMatch && typeof stats.filesRead === 'number') stats.filesRead += countFiles(readMatch[1]);
  if (createdMatch && typeof stats.filesCreated === 'number') stats.filesCreated += countFiles(createdMatch[1]);
  if (modifiedMatch && typeof stats.filesModified === 'number') stats.filesModified += countFiles(modifiedMatch[1]);

  // Parse Tests run / verification
  const testsMatch = content.match(/##\s+Tests run\r?\n+([\s\S]*?)(?=##|$)/i);
  if (testsMatch && testsMatch[1].trim()) {
    const text = testsMatch[1].trim();
    if (!/^(none|n\/a|na|-|—|\.{3}|no tests?|unrun)\.?$/i.test(text)) {
      if (!stats.verification) {
        stats.verification = { run: 0, passed: 0, failed: 0 };
      }
      stats.verification.run++;
      const hasFailure =
        /\b([1-9]\d*\s+failed|fail(ed|ure)?|error)\b/i.test(text) && !/\b0\s+failed\b/i.test(text);
      if (hasFailure) {
        stats.verification.failed++;
      } else {
        stats.verification.passed++;
      }
    }
  }
}

function parseJSONSession(filePath, stats) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  stats.total++;

  if (data.classification && stats.classifications) {
    const val = data.classification;
    if (stats.classifications[val] !== undefined) {
      stats.classifications[val]++;
    }
  }
  if (data.outcome && stats.outcomes) {
    let outcome = 'Handed Off';
    if (/completed/i.test(data.outcome)) outcome = 'Completed';
    else if (/blocked/i.test(data.outcome)) outcome = 'Blocked';
    stats.outcomes[outcome]++;
  } else if (stats.outcomes) {
    stats.outcomes['Handed Off']++;
  }
  if (data.agent && stats.agents) {
    stats.agents[data.agent] = (stats.agents[data.agent] || 0) + 1;
  }
  if (data.filesTouched) {
    if (data.filesTouched.read && typeof stats.filesRead === 'number') {
      stats.filesRead += parseFileList(data.filesTouched.read);
    }
    if (data.filesTouched.created && typeof stats.filesCreated === 'number') {
      stats.filesCreated += parseFileList(data.filesTouched.created);
    }
    if (data.filesTouched.modified && typeof stats.filesModified === 'number') {
      stats.filesModified += parseFileList(data.filesTouched.modified);
    }
  }

  // Parse verification in JSON
  const v = data.testsRun || data.verification;
  if (v) {
    if (!stats.verification) {
      stats.verification = { run: 0, passed: 0, failed: 0 };
    }
    stats.verification.run++;
    if (typeof v === 'object' && v !== null) {
      if (v.passed === false || (typeof v.failed === 'number' && v.failed > 0) || (typeof v.result === 'string' && /fail/i.test(v.result))) {
        stats.verification.failed++;
      } else {
        stats.verification.passed++;
      }
    } else if (typeof v === 'string') {
      const hasFailure = /\b([1-9]\d*\s+failed|fail(ed|ure)?|error)\b/i.test(v) && !/\b0\s+failed\b/i.test(v);
      if (hasFailure) {
        stats.verification.failed++;
      } else {
        stats.verification.passed++;
      }
    } else {
      stats.verification.passed++;
    }
  }
}

function parseGuardrailsBypassLog(filePath) {
  const result = {
    total: 0,
    withReason: 0,
    withoutReason: 0,
    categories: {
      scope: 0,
      protectedPath: 0,
      forbiddenPattern: 0,
      verification: 0,
      other: 0,
    },
    entries: [],
  };

  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;

    result.total++;

    const hasReason = /\breason:\s*(.+?)\s*\|/i.test(trimmed);
    if (hasReason) {
      result.withReason++;
    } else {
      result.withoutReason++;
    }

    const bypassedMatch = trimmed.match(/bypassed:\s*(.+)$/i);
    const bypassedText = bypassedMatch ? bypassedMatch[1] : '';

    if (/forbidden pattern|secret|api[_-]?key|token|private key|access key/i.test(bypassedText)) {
      result.categories.forbiddenPattern++;
    } else if (/protected path/i.test(bypassedText)) {
      result.categories.protectedPath++;
    } else if (/scope/i.test(bypassedText)) {
      result.categories.scope++;
    } else if (/\b(verification|pre-commit verification|pre-stop verification)\b/i.test(bypassedText)) {
      result.categories.verification++;
    } else {
      result.categories.other++;
    }

    result.entries.push(trimmed);
  }

  return result;
}

function parseDecisionsLog(filePath) {
  const result = {
    total: 0,
    decisions: [],
  };

  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.matchAll(/^###\s+(\d{4}-\d{2}-\d{2})\s*[-—]\s*(.+)$/gm);

  for (const m of matches) {
    result.total++;
    result.decisions.push({
      date: m[1],
      title: m[2].trim(),
    });
  }

  return result;
}

function collectMetrics(target) {
  const sessionsDir = path.join(target, '.agent-room', 'sessions');
  const bypassLogFile = path.join(target, '.agent-room', 'guardrails-bypass-log.md');
  const decisionsFile = path.join(target, '.agent-room', 'decisions.md');
  const configFile = path.join(target, '.agent-room.json');

  let projectName = path.basename(path.resolve(target));
  if (fs.existsSync(configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (cfg && cfg.name) projectName = cfg.name;
    } catch {
      // Fallback to directory name if config is unreadable or malformed
    }
  }

  const stats = {
    total: 0,
    classifications: { Bug: 0, Enhancement: 0, Feature: 0, Product: 0 },
    outcomes: { Completed: 0, Blocked: 0, 'Handed Off': 0 },
    agents: {},
    filesRead: 0,
    filesCreated: 0,
    filesModified: 0,
    verification: { run: 0, passed: 0, failed: 0 },
  };

  if (fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory()) {
    const files = fs.readdirSync(sessionsDir).filter(
      (f) => (f.endsWith('.md') || f.endsWith('.json')) && f !== '.gitkeep'
    );
    for (const file of files) {
      const fullPath = path.join(sessionsDir, file);
      try {
        if (file.endsWith('.json')) {
          parseJSONSession(fullPath, stats);
        } else {
          parseMarkdownSession(fullPath, stats);
        }
      } catch (err) {
        console.warn(yellow(`Warning: Failed to parse session log ${file}: ${err.message}`));
      }
    }
  }

  const bypassStats = parseGuardrailsBypassLog(bypassLogFile);
  const decisionStats = parseDecisionsLog(decisionsFile);

  const verificationPassRate =
    stats.verification.run > 0
      ? parseFloat(((stats.verification.passed / stats.verification.run) * 100).toFixed(1))
      : null;

  const decisionsPerSession =
    stats.total > 0
      ? parseFloat((decisionStats.total / stats.total).toFixed(2))
      : decisionStats.total;

  return {
    projectName,
    target: path.resolve(target),
    sessions: stats,
    verification: {
      totalRun: stats.verification.run,
      passed: stats.verification.passed,
      failed: stats.verification.failed,
      passRate: verificationPassRate,
    },
    decisions: {
      total: decisionStats.total,
      ratePerSession: decisionsPerSession,
      recent: decisionStats.decisions.slice(0, 5),
    },
    guardrails: {
      totalBypasses: bypassStats.total,
      bypassesWithReason: bypassStats.withReason,
      bypassesWithoutReason: bypassStats.withoutReason,
      categories: bypassStats.categories,
    },
  };
}

function formatJSON(telemetry) {
  return JSON.stringify(telemetry, null, 2);
}

function formatCSV(telemetry) {
  const rows = [['category', 'metric', 'count', 'rate_or_percentage']];
  const s = telemetry.sessions;
  const t = s.total;
  const pct = (val) => (t > 0 ? ((val / t) * 100).toFixed(1) + '%' : '0.0%');

  rows.push(['session', 'total_sessions', t, '100.0%']);
  rows.push(['outcome', 'completed', s.outcomes.Completed, pct(s.outcomes.Completed)]);
  rows.push(['outcome', 'blocked', s.outcomes.Blocked, pct(s.outcomes.Blocked)]);
  rows.push(['outcome', 'handed_off', s.outcomes['Handed Off'], pct(s.outcomes['Handed Off'])]);

  rows.push(['classification', 'bug', s.classifications.Bug, pct(s.classifications.Bug)]);
  rows.push(['classification', 'enhancement', s.classifications.Enhancement, pct(s.classifications.Enhancement)]);
  rows.push(['classification', 'feature', s.classifications.Feature, pct(s.classifications.Feature)]);
  rows.push(['classification', 'product', s.classifications.Product, pct(s.classifications.Product)]);

  for (const [agent, count] of Object.entries(s.agents)) {
    rows.push(['agent', agent, count, pct(count)]);
  }

  rows.push(['files', 'read', s.filesRead, 'n/a']);
  rows.push(['files', 'created', s.filesCreated, 'n/a']);
  rows.push(['files', 'modified', s.filesModified, 'n/a']);

  const v = telemetry.verification;
  rows.push(['verification', 'total_run', v.totalRun, pct(v.totalRun)]);
  rows.push(['verification', 'passed', v.passed, v.totalRun > 0 ? ((v.passed / v.totalRun) * 100).toFixed(1) + '%' : '0.0%']);
  rows.push(['verification', 'failed', v.failed, v.totalRun > 0 ? ((v.failed / v.totalRun) * 100).toFixed(1) + '%' : '0.0%']);
  rows.push(['verification', 'pass_rate', v.passed, v.passRate !== null ? `${v.passRate}%` : 'n/a']);

  const d = telemetry.decisions;
  rows.push(['decisions', 'total', d.total, `${d.ratePerSession} per session`]);

  const g = telemetry.guardrails;
  rows.push(['guardrails', 'total_bypasses', g.totalBypasses, 'n/a']);
  rows.push(['guardrails', 'bypasses_with_reason', g.bypassesWithReason, 'n/a']);
  rows.push(['guardrails', 'bypasses_without_reason', g.bypassesWithoutReason, 'n/a']);
  rows.push(['guardrails_category', 'scope', g.categories.scope, 'n/a']);
  rows.push(['guardrails_category', 'protected_path', g.categories.protectedPath, 'n/a']);
  rows.push(['guardrails_category', 'forbidden_pattern', g.categories.forbiddenPattern, 'n/a']);
  rows.push(['guardrails_category', 'verification', g.categories.verification, 'n/a']);
  rows.push(['guardrails_category', 'other', g.categories.other, 'n/a']);

  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}

function formatMarkdown(telemetry) {
  const s = telemetry.sessions;
  const t = s.total;
  const pct = (val) => (t > 0 ? ((val / t) * 100).toFixed(1) : '0.0');

  const lines = [];
  lines.push(`# Agent Room Telemetry & Governance Report — ${telemetry.projectName}\n`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Repository:** \`${telemetry.target}\`\n`);

  lines.push('## Executive KPI Overview\n');
  lines.push('| Metric | Value | Details |');
  lines.push('| :--- | :--- | :--- |');
  lines.push(`| **Total Sessions Logged** | \`${t}\` | All historical recorded agent sessions |`);
  lines.push(`| **Success Rate (Completed)** | \`${pct(s.outcomes.Completed)}%\` | ${s.outcomes.Completed} of ${t} sessions completed |`);
  lines.push(`| **Verification Pass Rate** | \`${telemetry.verification.passRate !== null ? telemetry.verification.passRate + '%' : 'N/A'}\` | ${telemetry.verification.passed} passed / ${telemetry.verification.totalRun} runs |`);
  lines.push(`| **Decisions Logged** | \`${telemetry.decisions.total}\` | ${telemetry.decisions.ratePerSession} decisions per session |`);
  lines.push(`| **Guardrail Bypasses** | \`${telemetry.guardrails.totalBypasses}\` | ${telemetry.guardrails.bypassesWithReason} with auditable justification |`);
  lines.push('');

  lines.push('## Outcomes & Success Rate\n');
  lines.push('| Outcome | Count | Share |');
  lines.push('| :--- | :--- | :--- |');
  lines.push(`| Completed | ${s.outcomes.Completed} | ${pct(s.outcomes.Completed)}% |`);
  lines.push(`| Blocked | ${s.outcomes.Blocked} | ${pct(s.outcomes.Blocked)}% |`);
  lines.push(`| Handed Off | ${s.outcomes['Handed Off']} | ${pct(s.outcomes['Handed Off'])}% |`);
  lines.push('');

  lines.push('## Work Classification Distribution\n');
  lines.push('| Type | Count | Share |');
  lines.push('| :--- | :--- | :--- |');
  lines.push(`| Bug | ${s.classifications.Bug} | ${pct(s.classifications.Bug)}% |`);
  lines.push(`| Enhancement | ${s.classifications.Enhancement} | ${pct(s.classifications.Enhancement)}% |`);
  lines.push(`| Feature | ${s.classifications.Feature} | ${pct(s.classifications.Feature)}% |`);
  lines.push(`| Product | ${s.classifications.Product} | ${pct(s.classifications.Product)}% |`);
  lines.push('');

  lines.push('## Agent Activity Breakdown\n');
  const agentsSorted = Object.entries(s.agents).sort((a, b) => b[1] - a[1]);
  if (agentsSorted.length === 0) {
    lines.push('_No agent activity logged._\n');
  } else {
    lines.push('| Agent Tool / Model | Sessions | Share |');
    lines.push('| :--- | :--- | :--- |');
    for (const [agent, count] of agentsSorted) {
      lines.push(`| ${agent} | ${count} | ${pct(count)}% |`);
    }
    lines.push('');
  }

  lines.push('## Verification & Quality Assurance\n');
  lines.push('| Metric | Value |');
  lines.push('| :--- | :--- |');
  lines.push(`| Verified Sessions | ${telemetry.verification.totalRun} (${pct(telemetry.verification.totalRun)}% of total) |`);
  lines.push(`| Tests Passed | ${telemetry.verification.passed} |`);
  lines.push(`| Tests Failed | ${telemetry.verification.failed} |`);
  lines.push(`| Overall Pass Rate | ${telemetry.verification.passRate !== null ? telemetry.verification.passRate + '%' : 'N/A'} |`);
  lines.push('');

  lines.push('## Governance & Guardrails Compliance\n');
  lines.push('| Metric | Count |');
  lines.push('| :--- | :--- |');
  lines.push(`| Total Recorded Bypasses | ${telemetry.guardrails.totalBypasses} |`);
  lines.push(`| Bypasses with Audit Reason | ${telemetry.guardrails.bypassesWithReason} |`);
  lines.push(`| Bypasses without Reason | ${telemetry.guardrails.bypassesWithoutReason} |`);
  lines.push(`| Scope Boundary Bypasses | ${telemetry.guardrails.categories.scope} |`);
  lines.push(`| Protected Path Bypasses | ${telemetry.guardrails.categories.protectedPath} |`);
  lines.push(`| Forbidden Pattern / Secret Bypasses | ${telemetry.guardrails.categories.forbiddenPattern} |`);
  lines.push(`| Verification Gate Bypasses | ${telemetry.guardrails.categories.verification} |`);
  lines.push('');

  if (telemetry.decisions.recent && telemetry.decisions.recent.length > 0) {
    lines.push('## Recent Architectural Decisions\n');
    for (const d of telemetry.decisions.recent) {
      lines.push(`- **${d.date}**: ${d.title}`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

function formatText(telemetry) {
  const stats = telemetry.sessions;
  const t = stats.total;
  const pct = (val) => (t > 0 ? ((val / t) * 100).toFixed(1) : '0.0');

  const bar = (val) => {
    if (t === 0) return '[                    ]';
    const fillCount = Math.round((val / t) * 20);
    const fill = '='.repeat(Math.max(0, fillCount - 1)) + (fillCount > 0 ? '>' : '');
    const empty = ' '.repeat(20 - fillCount);
    return `[${fill}${empty}]`;
  };

  const lines = [];
  lines.push(bold('======================================================'));
  lines.push(bold('              Agent Session Dashboard'));
  lines.push(bold('======================================================'));
  lines.push(`Total Sessions Logged: ${cyan(t)}\n`);

  lines.push(bold('--- Outcomes Success Rate ---'));
  lines.push(`Completed:  ${green(bar(stats.outcomes.Completed))} ${pct(stats.outcomes.Completed)}% (${stats.outcomes.Completed})`);
  lines.push(`Blocked:    ${red(bar(stats.outcomes.Blocked))} ${pct(stats.outcomes.Blocked)}% (${stats.outcomes.Blocked})`);
  lines.push(`Handed Off: ${yellow(bar(stats.outcomes['Handed Off']))} ${pct(stats.outcomes['Handed Off'])}% (${stats.outcomes['Handed Off']})\n`);

  lines.push(bold('--- Classification Distribution ---'));
  lines.push(`Bug:         ${stats.classifications.Bug} (${pct(stats.classifications.Bug)}%)`);
  lines.push(`Enhancement: ${stats.classifications.Enhancement} (${pct(stats.classifications.Enhancement)}%)`);
  lines.push(`Feature:     ${stats.classifications.Feature} (${pct(stats.classifications.Feature)}%)`);
  lines.push(`Product:     ${stats.classifications.Product} (${pct(stats.classifications.Product)}%)\n`);

  lines.push(bold('--- Agent Breakdown ---'));
  const agentsSorted = Object.entries(stats.agents).sort((a, b) => b[1] - a[1]);
  if (agentsSorted.length === 0) {
    lines.push('No agent information logged.');
  } else {
    for (const [agent, count] of agentsSorted) {
      lines.push(`- ${agent}: ${count} session(s)`);
    }
  }
  lines.push('');

  lines.push(bold('--- File Volumes ---'));
  lines.push(`Files Read:     ${stats.filesRead}`);
  lines.push(`Files Created:  ${stats.filesCreated}`);
  lines.push(`Files Modified: ${stats.filesModified}\n`);

  lines.push(bold('--- Test Verification & Quality ---'));
  if (telemetry.verification.totalRun > 0) {
    lines.push(`Pass Rate:      ${green(String(telemetry.verification.passRate) + '%')} (${telemetry.verification.passed} passed, ${telemetry.verification.failed} failed)`);
    lines.push(`Sessions Run:   ${telemetry.verification.totalRun} of ${t} (${pct(telemetry.verification.totalRun)}%)\n`);
  } else {
    lines.push('No verification test executions recorded in session logs.\n');
  }

  lines.push(bold('--- Governance & Guardrails ---'));
  lines.push(`Decisions Logged:   ${cyan(telemetry.decisions.total)} (${telemetry.decisions.ratePerSession} per session)`);
  lines.push(`Guardrail Bypasses: ${telemetry.guardrails.totalBypasses === 0 ? green('0') : yellow(String(telemetry.guardrails.totalBypasses))}`);
  if (telemetry.guardrails.totalBypasses > 0) {
    const cats = telemetry.guardrails.categories;
    const catParts = [];
    if (cats.scope > 0) catParts.push(`scope: ${cats.scope}`);
    if (cats.protectedPath > 0) catParts.push(`protected path: ${cats.protectedPath}`);
    if (cats.forbiddenPattern > 0) catParts.push(`forbidden patterns: ${cats.forbiddenPattern}`);
    if (cats.verification > 0) catParts.push(`verification: ${cats.verification}`);
    if (cats.other > 0) catParts.push(`other: ${cats.other}`);
    lines.push(`  Bypass Breakdown: ${catParts.join(', ')}`);
    lines.push(`  Audit Reasons:    ${telemetry.guardrails.bypassesWithReason} with reason, ${telemetry.guardrails.bypassesWithoutReason} without reason`);
  }
  lines.push(bold('======================================================'));

  return lines.join('\n');
}

function runMetrics(target, args = {}) {
  const format = (args.format || 'text').toLowerCase();
  const validFormats = ['text', 'json', 'csv', 'markdown'];
  if (!validFormats.includes(format)) {
    throw new Error(`Error: Invalid format "${format}". Valid formats: ${validFormats.join(', ')}`);
  }

  const sessionsDir = path.join(target, '.agent-room', 'sessions');
  const hasSessionsDir = fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory();
  const sessionFiles = hasSessionsDir
    ? fs.readdirSync(sessionsDir).filter((f) => (f.endsWith('.md') || f.endsWith('.json')) && f !== '.gitkeep')
    : [];

  // Backward compatibility with previous text CLI handling when no sessions exist
  if (format === 'text') {
    if (!hasSessionsDir) {
      console.log(yellow(`No sessions directory found at ${path.relative(process.cwd(), sessionsDir)}`));
      console.log('Ensure agents have logged sessions under .agent-room/sessions/ first.');
      return;
    }
    if (sessionFiles.length === 0) {
      console.log(yellow('No session logs found.'));
      return;
    }
  }

  const telemetry = collectMetrics(target);
  let output;
  if (format === 'json') {
    output = formatJSON(telemetry);
  } else if (format === 'csv') {
    output = formatCSV(telemetry);
  } else if (format === 'markdown') {
    output = formatMarkdown(telemetry);
  } else {
    output = formatText(telemetry);
  }

  if (args.output) {
    const dest = path.resolve(args.output);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, output, 'utf8');
    console.log(`Metrics report (${format}) written to ${dest}`);
  } else {
    console.log(output);
  }
}

module.exports = {
  runMetrics,
  collectMetrics,
  parseMarkdownSession,
  parseJSONSession,
  parseGuardrailsBypassLog,
  parseDecisionsLog,
  formatJSON,
  formatCSV,
  formatMarkdown,
  formatText,
};
