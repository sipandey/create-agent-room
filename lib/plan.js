'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parses YAML frontmatter from a markdown string.
 */
function parseFrontmatter(content) {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(fmRegex);
  if (!match) return { metadata: {}, body: content };

  const fmContent = match[1];
  const body = content.slice(match[0].length);
  const metadata = {};
  let currentKey = null;

  for (const line of fmContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sepIndex = line.indexOf(':');
    if (sepIndex !== -1 && !line.startsWith(' ') && !line.startsWith('\t')) {
      const key = line.slice(0, sepIndex).trim();
      const val = line.slice(sepIndex + 1).trim();
      metadata[key] = val.replace(/^["']|["']$/g, '');
      currentKey = key;
    } else if (currentKey && (line.startsWith(' ') || line.startsWith('\t') || trimmed.startsWith('-'))) {
      if (metadata[currentKey]) {
        metadata[currentKey] += ' ' + trimmed;
      } else {
        metadata[currentKey] = trimmed;
      }
    }
  }

  if (metadata.phases_total !== undefined && !isNaN(Number(metadata.phases_total))) {
    metadata.phases_total = Number(metadata.phases_total);
  }
  if (metadata.phases_completed !== undefined && !isNaN(Number(metadata.phases_completed))) {
    metadata.phases_completed = Number(metadata.phases_completed);
  }

  return { metadata, body };
}

/**
 * Parses a markdown implementation plan into structured phases and tasks.
 */
function parsePlan(content) {
  if (typeof content !== 'string') return null;
  const { metadata, body } = parseFrontmatter(content);

  const phases = [];
  const phaseHeaderRegex = /(?:^|\n)#{2,3}\s+Phase\s+(\d+)[:\s]+([^\n]+)/gi;
  const headerMatches = [];
  let m;
  while ((m = phaseHeaderRegex.exec(body)) !== null) {
    headerMatches.push({
      phaseNumber: parseInt(m[1], 10),
      title: m[2].trim(),
      index: m.index,
      headerLength: m[0].length,
    });
  }

  for (let i = 0; i < headerMatches.length; i++) {
    const curr = headerMatches[i];
    const startIndex = curr.index + curr.headerLength;
    const endIndex = i + 1 < headerMatches.length ? headerMatches[i + 1].index : body.length;
    const phaseSection = body.slice(startIndex, endIndex);

    const tasks = [];
    const checkboxRegex = /^[ \t]*-[ \t]*\[([ xX])\][ \t]+([^\r\n]+)/gm;
    let cm;
    while ((cm = checkboxRegex.exec(phaseSection)) !== null) {
      tasks.push({
        completed: cm[1].toLowerCase() === 'x',
        text: cm[2].trim(),
      });
    }

    let verificationCommand = null;
    const autoVerifMatch = phaseSection.match(/(?:\*?Automated\s+Verification:?\*?:?|####\s+Automated\s+Verification:?)[^\n`]*`([^`]+)`/i);
    if (autoVerifMatch) {
      verificationCommand = autoVerifMatch[1].trim();
    } else {
      const codeBlockMatch = phaseSection.match(/(?:\*?Automated\s+Verification:?\*?:?|####\s+Automated\s+Verification:?)[^\n`]*```[a-z]*\r?\n([^\r\n`]+)/i);
      if (codeBlockMatch) {
        verificationCommand = codeBlockMatch[1].trim();
      }
    }

    const completedTasks = tasks.filter((t) => t.completed).length;
    const isPhaseComplete = tasks.length > 0 && completedTasks === tasks.length;

    phases.push({
      number: curr.phaseNumber,
      title: curr.title,
      tasks,
      tasksTotal: tasks.length,
      tasksCompleted: completedTasks,
      isComplete: isPhaseComplete,
      verificationCommand,
    });
  }

  const completedPhases = phases.filter((p) => p.isComplete).length;
  const isComplete = phases.length > 0 && completedPhases === phases.length;

  return {
    metadata,
    phases,
    phasesTotal: phases.length,
    phasesCompleted: completedPhases,
    isComplete,
  };
}

/**
 * Calculates the exact resumption point from a parsed plan.
 * Used for context compaction and session restarts.
 */
function getPlanResumptionPoint(plan) {
  if (!plan || !Array.isArray(plan.phases)) return null;

  for (let i = 0; i < plan.phases.length; i++) {
    const phase = plan.phases[i];
    if (!phase.isComplete) {
      const firstUncheckedTask = phase.tasks.find((t) => !t.completed);
      return {
        activePhaseIndex: i,
        phaseNumber: phase.number,
        phaseTitle: phase.title,
        firstUncheckedTask: firstUncheckedTask ? firstUncheckedTask.text : null,
        verificationCommand: phase.verificationCommand || null,
        isComplete: false,
      };
    }
  }

  return {
    activePhaseIndex: null,
    phaseNumber: null,
    phaseTitle: null,
    firstUncheckedTask: null,
    verificationCommand: null,
    isComplete: true,
  };
}

/**
 * Discovers the active implementation plan in target/docs/plans/.
 * Prioritizes plans matching currentBranch, then newest non-complete plans.
 */
function findActivePlan(target, currentBranch) {
  const plansDir = path.join(target, 'docs', 'plans');
  if (!fs.existsSync(plansDir)) return null;

  const planFiles = fs
    .readdirSync(plansDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('.'))
    .sort()
    .reverse();

  if (planFiles.length === 0) return null;

  let candidatePlan = null;

  for (const file of planFiles) {
    const filePath = path.join(plansDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parsePlan(content);
      if (!parsed) continue;

      const planBranch = parsed.metadata && parsed.metadata.branch;
      if (currentBranch && planBranch === currentBranch) {
        return {
          file,
          filePath,
          relPath: path.join('docs', 'plans', file).replace(/\\/g, '/'),
          ...parsed,
        };
      }

      if (!candidatePlan && parsed.metadata && parsed.metadata.status !== 'complete') {
        candidatePlan = {
          file,
          filePath,
          relPath: path.join('docs', 'plans', file).replace(/\\/g, '/'),
          ...parsed,
        };
      }
    } catch (err) {
      // ignore unreadable file
    }
  }

  if (candidatePlan) return candidatePlan;

  const newestFile = planFiles[0];
  try {
    const newestPath = path.join(plansDir, newestFile);
    const content = fs.readFileSync(newestPath, 'utf8');
    const parsed = parsePlan(content);
    if (parsed) {
      return {
        file: newestFile,
        filePath: newestPath,
        relPath: path.join('docs', 'plans', newestFile).replace(/\\/g, '/'),
        ...parsed,
      };
    }
  } catch (err) {
    // ignore
  }

  return null;
}

module.exports = {
  parseFrontmatter,
  parsePlan,
  getPlanResumptionPoint,
  findActivePlan,
};
