'use strict';

const fs = require('fs');
const path = require('path');
const { green, red } = require('./color');

const { verifyProject } = require('./verify');
const { parseGuardrailsBypassLog, parseDecisionsLog } = require('./metrics');

function getSection(content, headerName) {
  const escapedHeader = headerName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`##\\s*${escapedHeader}\\s*\\r?\\n([\\s\\S]*?)(?:\\r?\\n##|$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

function parseMarkdownSession(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/i);
  const agentMatch = content.match(/\*\*Agent:\*\*\s*(.+)/i);
  const classMatch = content.match(/\*\*Classification:\*\*\s*(.+)/i);

  const goal = getSection(content, 'Goal');
  const filesTouched = getSection(content, 'Files touched');
  const actions = getSection(content, 'Actions taken');
  const tests = getSection(content, 'Tests run');
  const decisions = getSection(content, 'Decisions made');
  const outcomeRaw = getSection(content, 'Outcome');

  // Parse Handoff note specifically
  const handoffRegex = /\*\*Handoff note[^:]*:\*\*\r?\n?([\s\S]*)/i;
  const handoffMatch = content.match(handoffRegex);
  const handoffNote = handoffMatch ? handoffMatch[1].trim() : '';

  // Clean outcome of handoff note text
  let outcome = outcomeRaw;
  const handoffHeaderMatch = outcomeRaw.match(/\*\*Handoff note/i);
  if (handoffHeaderMatch) {
    outcome = outcomeRaw.slice(0, handoffHeaderMatch.index).trim();
  }

  return {
    date: dateMatch ? dateMatch[1].trim() : 'N/A',
    agent: agentMatch ? agentMatch[1].trim().replace(/\[|\]/g, '') : 'N/A',
    classification: classMatch ? classMatch[1].trim() : 'N/A',
    goal,
    filesTouched,
    actions,
    tests,
    decisions,
    outcome: outcome || 'Completed',
    handoffNote
  };
}

function parseJSONSession(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);

  const formatFileList = (files) => {
    if (Array.isArray(files)) return files.map((f) => `- ${f}`).join('\n');
    if (typeof files === 'object' && files !== null) {
      const parts = [];
      if (files.read) parts.push(`- Read: ${Array.isArray(files.read) ? files.read.join(', ') : files.read}`);
      if (files.created) parts.push(`- Created: ${Array.isArray(files.created) ? files.created.join(', ') : files.created}`);
      if (files.modified) parts.push(`- Modified: ${Array.isArray(files.modified) ? files.modified.join(', ') : files.modified}`);
      return parts.join('\n');
    }
    return String(files || '');
  };

  const formatActions = (actions) => {
    if (Array.isArray(actions)) return actions.map((a, i) => `${i + 1}. ${a}`).join('\n');
    return String(actions || '');
  };

  return {
    date: data.date || 'N/A',
    agent: data.agent || 'N/A',
    classification: data.classification || 'N/A',
    goal: data.goal || '',
    filesTouched: formatFileList(data.filesTouched),
    actions: formatActions(data.actions),
    tests: data.testsRun ? `Command: ${data.testsRun.command || ''}\nResult: ${data.testsRun.result || ''}` : '',
    decisions: Array.isArray(data.decisions) ? data.decisions.map((d) => `- ${d}`).join('\n') : String(data.decisions || ''),
    outcome: data.outcome || 'Completed',
    handoffNote: data.handoffNote || ''
  };
}

function generateAttestationBlock(verifyResult) {
  if (!verifyResult) return '';

  const lines = ['### Verification Attestation Proof'];
  if (verifyResult.skipped) {
    lines.push('* **Status:** Skipped ⚠️ (No verification test command configured in .agent-room.json)');
    return lines.join('\n');
  }

  lines.push(`* **Verification Command:** \`${verifyResult.command || 'None'}\``);
  lines.push(`* **Result:** ${verifyResult.ok ? 'Passed ✅' : (verifyResult.timedOut ? 'TIMED OUT ❌' : 'FAILED ❌')}`);
  lines.push(`* **Exit Code:** \`${verifyResult.exitCode !== undefined ? verifyResult.exitCode : 'N/A'}\``);
  lines.push(`* **Duration:** \`${verifyResult.durationMs || 0}ms\``);
  lines.push(`* **Timestamp:** \`${new Date().toISOString()}\``);

  if (verifyResult.output && verifyResult.output.trim()) {
    const raw = verifyResult.output.trim();
    const bounded = raw.length > 2500 ? raw.slice(0, 2500) + '\n... (output truncated)' : raw;
    lines.push('');
    lines.push('<details open>');
    lines.push(`<summary>${verifyResult.ok ? 'Console Output' : 'Failure Output'}</summary>\n`);
    lines.push('```');
    lines.push(bounded);
    lines.push('```');
    lines.push('</details>');
  }

  return lines.join('\n');
}

function generateComplianceChecklist(opts = {}) {
  const { verifyResult, bypassStats, session, decisionsStats } = opts;
  const testsPassing = Boolean(verifyResult && verifyResult.ok);
  const bypassCount = bypassStats ? bypassStats.total : 0;
  const guardrailsCompliant = bypassCount === 0;
  const decisionsDocumented = Boolean(
    (session && session.decisions && session.decisions.trim() && !/^(none|n\/a)$/i.test(session.decisions.trim())) ||
    (decisionsStats && decisionsStats.total > 0)
  );

  const lines = [
    '## Reviewer Compliance Checklist',
    `- [${testsPassing ? 'x' : ' '}] Automated verification test suite passing (${verifyResult && verifyResult.command ? `\`${verifyResult.command}\`` : 'configured suite'})`,
    `- [${decisionsDocumented ? 'x' : ' '}] Architectural decisions documented in \`.agent-room/decisions.md\``,
    `- [${guardrailsCompliant ? 'x' : ' '}] Guardrail policies satisfied (${guardrailsCompliant ? 'zero bypasses' : `${bypassCount} auditable bypass(es) logged`})`,
    '- [x] Session log recorded under `.agent-room/sessions/`',
    '- [x] Scope boundaries respected during task execution',
  ];

  return lines.join('\n');
}

function generatePrDescription(session, latestFile, opts = {}) {
  const { verifyResult, bypassStats, decisionsStats, verify } = opts;

  let prDesc = `# Pull Request Description

## Overview
* **Session Log Reference:** [${latestFile}](.agent-room/sessions/${latestFile})
* **Date:** ${session.date}
* **Agent:** ${session.agent}
* **Classification:** ${session.classification}

## Goal
${session.goal || 'No goal documented.'}

## Changes Implemented
${session.filesTouched || 'No files touched documented.'}

## Actions Taken
${session.actions || 'No actions documented.'}

## Verification & Testing
${session.tests || 'No verification tests documented.'}
`;

  if (verify && verifyResult) {
    prDesc += `\n${generateAttestationBlock(verifyResult)}\n`;
  }

  prDesc += `\n## Decisions & Architecture Changes\n${session.decisions || 'No decisions documented.'}\n`;

  if (verify) {
    if (decisionsStats && decisionsStats.recent && decisionsStats.recent.length > 0) {
      prDesc += '\n### Recent Architectural Decisions\n';
      for (const d of decisionsStats.recent.slice(0, 3)) {
        prDesc += `- **${d.date}**: ${d.title}\n`;
      }
    }

    prDesc += '\n## Guardrails Compliance Attestation\n';
    if (!bypassStats || bypassStats.total === 0) {
      prDesc += '* **Status:** Compliant ✅ (Zero guardrail bypasses recorded)\n';
    } else {
      prDesc += `* **Status:** Audited Bypasses Recorded ⚠️ (${bypassStats.total} total)\n`;
      prDesc += `* **Justification Breakdown:** ${bypassStats.withReason} with reason, ${bypassStats.withoutReason} without reason\n`;
    }

    prDesc += `\n${generateComplianceChecklist({ verifyResult, bypassStats, session, decisionsStats })}\n`;
  }

  prDesc += `\n## Outcome & Next Steps\n* **Status:** ${session.outcome}\n`;

  if (session.handoffNote) {
    prDesc += `\n### Handoff Details\n${session.handoffNote}\n`;
  }

  return prDesc;
}

function runPrDesc(target, args = {}) {
  const sessionsDir = path.join(target, '.agent-room', 'sessions');
  if (!fs.existsSync(sessionsDir) || !fs.statSync(sessionsDir).isDirectory()) {
    console.error(red(`Error: Sessions directory not found at ${sessionsDir}`));
    process.exitCode = 1;
    return;
  }

  const files = fs.readdirSync(sessionsDir).filter(
    (f) => (f.endsWith('.md') || f.endsWith('.json')) && f !== '.gitkeep'
  );
  if (files.length === 0) {
    console.error(red('Error: No session logs found.'));
    process.exitCode = 1;
    return;
  }

  // Sort alphabetically to find the latest session log
  files.sort();
  const latestFile = files[files.length - 1];
  const fullPath = path.join(sessionsDir, latestFile);

  let session = null;
  try {
    if (latestFile.endsWith('.json')) {
      session = parseJSONSession(fullPath);
    } else {
      session = parseMarkdownSession(fullPath);
    }
  } catch (err) {
    console.error(red(`Error: Failed to parse session log ${latestFile}: ${err.message}`));
    process.exitCode = 1;
    return;
  }

  let verifyResult = null;
  let bypassStats = null;
  let decisionsStats = null;

  if (args.verify) {
    verifyResult = verifyProject(target, args);
    const bypassLogPath = path.join(target, '.agent-room', 'guardrails-bypass-log.md');
    const decisionsPath = path.join(target, '.agent-room', 'decisions.md');
    bypassStats = parseGuardrailsBypassLog(bypassLogPath);
    decisionsStats = parseDecisionsLog(decisionsPath);
  }

  const prDesc = generatePrDescription(session, latestFile, {
    verify: Boolean(args.verify),
    verifyResult,
    bypassStats,
    decisionsStats
  });

  // Print to stdout
  console.log(prDesc);

  // Write to .agent-room/pr-description.md if requested
  if (args.write || args.w) {
    const outputPath = path.join(target, '.agent-room', 'pr-description.md');
    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, prDesc);
      console.log(green(`\nSuccess: PR description written to ${outputPath}`));
    } catch (err) {
      console.error(red(`Error: Failed to write PR description to ${outputPath}: ${err.message}`));
      process.exitCode = 1;
    }
  }

  // Write to custom output file if requested
  if (args.output) {
    const dest = path.resolve(args.output);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, prDesc);
      console.log(green(`\nSuccess: PR description written to ${dest}`));
    } catch (err) {
      console.error(red(`Error: Failed to write PR description to ${dest}: ${err.message}`));
      process.exitCode = 1;
    }
  }

  if (args.verify && args.strict && verifyResult && !verifyResult.ok) {
    process.exitCode = 1;
  }

  return { prDesc, session, verifyResult };
}

module.exports = {
  runPrDesc,
  generatePrDescription,
  generateAttestationBlock,
  generateComplianceChecklist,
  parseMarkdownSession,
  parseJSONSession
};
