'use strict';

const fs = require('fs');
const path = require('path');
const { green, red } = require('./color');

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

function runPrDesc(target, args) {
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

  // Generate PR Description Markdown
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

## Decisions & Architecture Changes
${session.decisions || 'No decisions documented.'}

## Outcome & Next Steps
* **Status:** ${session.outcome}
`;

  if (session.handoffNote) {
    prDesc += `\n### Handoff Details\n${session.handoffNote}\n`;
  }

  // Print to stdout
  console.log(prDesc);

  // Optionally write to .agent-room/pr-description.md
  if (args.write) {
    const outputPath = path.join(target, '.agent-room', 'pr-description.md');
    try {
      fs.writeFileSync(outputPath, prDesc);
      console.log(green(`\nSuccess: PR description written to ${outputPath}`));
    } catch (err) {
      console.error(red(`Error: Failed to write PR description to ${outputPath}: ${err.message}`));
      process.exitCode = 1;
    }
  }
}

module.exports = {
  runPrDesc,
  parseMarkdownSession,
  parseJSONSession
};
