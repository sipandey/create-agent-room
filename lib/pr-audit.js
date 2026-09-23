'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function isPathProtected(filePath, protectedPattern) {
  const normalized = filePath.replace(/\\/g, '/');
  const pattern = protectedPattern.replace(/\\/g, '/');

  if (pattern.includes('*')) {
    const regexPattern = pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${regexPattern}$`).test(normalized);
  }

  return normalized === pattern || normalized.startsWith(pattern + '/');
}

function normalizeForbiddenEntry(entry) {
  if (typeof entry === 'string') {
    const looksLikeRegex = entry.match(/^\/.*\/[gimuy]*$/) || entry.startsWith('(?:') || entry.includes('(?:');
    return { pattern: entry, type: looksLikeRegex ? 'regex' : 'literal', label: entry };
  }
  if (entry && typeof entry === 'object' && typeof entry.pattern === 'string') {
    return {
      pattern: entry.pattern,
      type: entry.type === 'regex' ? 'regex' : 'literal',
      label: entry.description || entry.pattern,
    };
  }
  return { pattern: null, type: null, label: null };
}

function detectRuleWeakening(headGuardrails, currentGuardrails, guardrailsRelPath) {
  const violations = [];
  if (!headGuardrails || typeof headGuardrails !== 'object') {
    return violations;
  }
  const curr = currentGuardrails || {};

  // 1. protectedPaths
  const headProtected = (headGuardrails.protectedPaths || []).map((p) => String(p).replace(/\\/g, '/'));
  const currProtected = Array.isArray(curr.protectedPaths)
    ? curr.protectedPaths.map((p) => String(p).replace(/\\/g, '/'))
    : [];

  if (guardrailsRelPath) {
    const wasProtected = headProtected.some((p) => isPathProtected(guardrailsRelPath, p));
    const isStillProtected = currProtected.some((p) => isPathProtected(guardrailsRelPath, p));
    if (wasProtected && !isStillProtected) {
      violations.push(
        `Protected path violation: ${guardrailsRelPath} (removed from protectedPaths in PR)`
      );
    }
  }

  for (const hp of headProtected) {
    if (!currProtected.includes(hp)) {
      if (
        guardrailsRelPath &&
        isPathProtected(guardrailsRelPath, hp) &&
        violations.some((v) => v.includes('(removed from protectedPaths in PR)'))
      ) {
        continue;
      }
      violations.push(
        `Rule weakening violation: protected path "${hp}" was removed from protectedPaths in .agent-room/guardrails.json`
      );
    }
  }

  // 2. forbiddenActions
  const getPatternString = (item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object' && typeof item.pattern === 'string') {
      return item.pattern.trim();
    }
    return '';
  };

  const headForbidden = Array.isArray(headGuardrails.forbiddenActions) ? headGuardrails.forbiddenActions : [];
  const currForbidden = Array.isArray(curr.forbiddenActions) ? curr.forbiddenActions : [];
  const currPatterns = currForbidden.map(getPatternString);

  for (const item of headForbidden) {
    const pattern = getPatternString(item);
    if (!pattern) continue;
    if (!currPatterns.includes(pattern)) {
      violations.push(
        `Rule weakening violation: forbidden action pattern "${pattern}" was removed from forbiddenActions in .agent-room/guardrails.json`
      );
    } else if (typeof item === 'object' && item.type === 'regex') {
      const currentItem = currForbidden.find((ci) => getPatternString(ci) === pattern);
      if (currentItem && typeof currentItem === 'object' && currentItem.type === 'literal') {
        violations.push(
          `Rule weakening violation: forbidden action pattern "${pattern}" type was downgraded from regex to literal in .agent-room/guardrails.json`
        );
      }
    }
  }

  // 3. scopeGuidance
  if (headGuardrails.scopeGuidance && typeof headGuardrails.scopeGuidance === 'object') {
    const headMaxFiles = headGuardrails.scopeGuidance.maxFilesPerChange;
    const headMaxLines = headGuardrails.scopeGuidance.maxLinesPerChange;

    if (typeof headMaxFiles === 'number' && headMaxFiles > 0) {
      if (!curr.scopeGuidance || typeof curr.scopeGuidance.maxFilesPerChange !== 'number') {
        violations.push(
          'Rule weakening violation: scopeGuidance.maxFilesPerChange was removed from .agent-room/guardrails.json'
        );
      } else if (curr.scopeGuidance.maxFilesPerChange > headMaxFiles) {
        violations.push(
          `Rule weakening violation: scopeGuidance.maxFilesPerChange was increased from ${headMaxFiles} to ${curr.scopeGuidance.maxFilesPerChange} in .agent-room/guardrails.json`
        );
      }
    }

    if (typeof headMaxLines === 'number' && headMaxLines > 0) {
      if (!curr.scopeGuidance || typeof curr.scopeGuidance.maxLinesPerChange !== 'number') {
        violations.push(
          'Rule weakening violation: scopeGuidance.maxLinesPerChange was removed from .agent-room/guardrails.json'
        );
      } else if (curr.scopeGuidance.maxLinesPerChange > headMaxLines) {
        violations.push(
          `Rule weakening violation: scopeGuidance.maxLinesPerChange was increased from ${headMaxLines} to ${curr.scopeGuidance.maxLinesPerChange} in .agent-room/guardrails.json`
        );
      }
    }
  }

  // 4. importBoundaries
  if (Array.isArray(headGuardrails.importBoundaries) && headGuardrails.importBoundaries.length > 0) {
    const currImportRules = Array.isArray(curr.importBoundaries) ? curr.importBoundaries : [];
    for (const headRule of headGuardrails.importBoundaries) {
      if (!headRule || typeof headRule.source !== 'string') continue;
      const headSource = headRule.source.replace(/\\/g, '/');
      const matchingCurrRule = currImportRules.find(
        (r) => r && typeof r.source === 'string' && r.source.replace(/\\/g, '/') === headSource
      );
      if (!matchingCurrRule) {
        violations.push(
          `Rule weakening violation: importBoundaries rule for source "${headRule.source}" was removed from .agent-room/guardrails.json`
        );
      } else {
        const headDisallowed = (headRule.disallowed || headRule.forbiddenImports || []).map((p) =>
          String(p).replace(/\\/g, '/')
        );
        const currDisallowed = (matchingCurrRule.disallowed || matchingCurrRule.forbiddenImports || []).map((p) =>
          String(p).replace(/\\/g, '/')
        );
        for (const disPattern of headDisallowed) {
          if (!currDisallowed.includes(disPattern)) {
            violations.push(
              `Rule weakening violation: importBoundaries for source "${headRule.source}" dropped disallowed import "${disPattern}" in .agent-room/guardrails.json`
            );
          }
        }
      }
    }
  }

  // 5. scopeBoundaries
  if (headGuardrails.scopeBoundaries && typeof headGuardrails.scopeBoundaries === 'object') {
    if (
      Array.isArray(headGuardrails.scopeBoundaries.allowedPaths) &&
      headGuardrails.scopeBoundaries.allowedPaths.length > 0
    ) {
      if (
        !curr.scopeBoundaries ||
        !Array.isArray(curr.scopeBoundaries.allowedPaths) ||
        curr.scopeBoundaries.allowedPaths.length === 0
      ) {
        violations.push(
          'Rule weakening violation: scopeBoundaries.allowedPaths was removed or emptied in .agent-room/guardrails.json'
        );
      } else {
        for (const p of headGuardrails.scopeBoundaries.allowedPaths) {
          if (!curr.scopeBoundaries.allowedPaths.includes(p)) {
            violations.push(
              `Rule weakening violation: scopeBoundaries.allowedPaths dropped "${p}" in .agent-room/guardrails.json`
            );
          }
        }
      }
    }

    if (
      Array.isArray(headGuardrails.scopeBoundaries.disallowedCrossBoundaries) &&
      headGuardrails.scopeBoundaries.disallowedCrossBoundaries.length > 0
    ) {
      const currCross = Array.isArray(curr.scopeBoundaries?.disallowedCrossBoundaries)
        ? curr.scopeBoundaries.disallowedCrossBoundaries
        : [];
      const serializeGroup = (g) => (Array.isArray(g) ? [...g].sort().join('::') : '');
      const currGroupStrings = currCross.map(serializeGroup);

      for (const headGroup of headGuardrails.scopeBoundaries.disallowedCrossBoundaries) {
        const hStr = serializeGroup(headGroup);
        if (hStr && !currGroupStrings.includes(hStr)) {
          violations.push(
            `Rule weakening violation: scopeBoundaries.disallowedCrossBoundaries group [${headGroup.join(', ')}] was removed in .agent-room/guardrails.json`
          );
        }
      }
    }
  }

  // 6. verifyOnCommit
  const isHeadVerify =
    headGuardrails.verifyOnCommit === true ||
    (headGuardrails.verifyOnCommit && headGuardrails.verifyOnCommit.enabled !== false);
  const isCurrVerify =
    curr.verifyOnCommit === true || (curr.verifyOnCommit && curr.verifyOnCommit.enabled !== false);
  if (isHeadVerify && !isCurrVerify) {
    violations.push(
      'Rule weakening violation: verifyOnCommit was disabled or removed from .agent-room/guardrails.json'
    );
  }

  // 7. strictWaivers
  const isHeadStrict =
    headGuardrails.strictWaivers === true ||
    (headGuardrails.verifyOnCommit && headGuardrails.verifyOnCommit.strict === true);
  const isCurrStrict =
    curr.strictWaivers === true || (curr.verifyOnCommit && curr.verifyOnCommit.strict === true);
  if (isHeadStrict && !isCurrStrict) {
    violations.push(
      'Rule weakening violation: strict waiver auditing was disabled or removed from .agent-room/guardrails.json'
    );
  }

  return violations;
}

function resolveBaseRef(target, options) {
  options = options || {};
  let candidate = options.base || options['base-ref'] || options.baseRef;

  if (!candidate) {
    candidate = process.env.GITHUB_BASE_REF || process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME;
  }

  if (!candidate) return null;

  candidate = candidate.trim();

  // Try direct ref verification in git
  try {
    execFileSync('git', ['rev-parse', '--verify', candidate], { cwd: target, stdio: 'ignore' });
    return candidate;
  } catch (err) {
    // Try origin/<candidate>
    try {
      const remoteCandidate = `origin/${candidate}`;
      execFileSync('git', ['rev-parse', '--verify', remoteCandidate], { cwd: target, stdio: 'ignore' });
      return remoteCandidate;
    } catch (e) {
      return candidate; // return raw candidate, git command will report clean error
    }
  }
}

function auditPullRequest(target, options) {
  options = options || {};
  target = path.resolve(target || '.');
  const t0 = Date.now();

  const baseRef = resolveBaseRef(target, options);
  if (!baseRef) {
    return {
      ok: true,
      skipped: true,
      reason: 'no-base-ref',
      baseRef: null,
      mergeBase: null,
      durationMs: 0,
      antiTamper: { ok: true, deleted: false, weakened: false, authorized: false, violations: [] },
      bypassAudit: { ok: true, newEntriesCount: 0, violations: [] },
      sessionAudit: { ok: true, required: false, sessionsFound: [], violations: [] },
      errors: [],
      warnings: [],
    };
  }

  const errors = [];
  const warnings = [];

  let mergeBase = null;
  try {
    mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], {
      cwd: target,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      baseRef,
      mergeBase: null,
      durationMs: Date.now() - t0,
      antiTamper: { ok: false, deleted: false, weakened: false, authorized: false, violations: [] },
      bypassAudit: { ok: false, newEntriesCount: 0, violations: [] },
      sessionAudit: { ok: false, required: false, sessionsFound: [], violations: [] },
      errors: [`Failed to compute git merge-base between "${baseRef}" and HEAD: ${err.message}`],
      warnings: [],
    };
  }

  // Get diff files
  let diffRaw = '';
  try {
    diffRaw = execFileSync('git', ['diff', '--name-status', `${mergeBase}...HEAD`], {
      cwd: target,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    diffRaw = '';
  }

  const diffEntries = diffRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/);
      return { status: parts[0] ? parts[0].charAt(0) : 'M', file: parts[1] || '' };
    });

  const changedFiles = diffEntries.map((e) => e.file.replace(/\\/g, '/'));

  // Get new bypass entries from diff on .agent-room/guardrails-bypass-log.md
  let bypassDiff = '';
  try {
    bypassDiff = execFileSync(
      'git',
      ['diff', `${mergeBase}...HEAD`, '--', '.agent-room/guardrails-bypass-log.md'],
      { cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (err) {
    bypassDiff = '';
  }

  const newBypassEntries = bypassDiff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++') && line.includes(' | author: '))
    .map((line) => line.slice(1).trim());

  // 1. Anti-Tamper & Rule Weakening Check
  const antiTamperViolations = [];
  let isGuardrailsDeleted = false;
  let isGuardrailsWeakened = false;
  let isBypassAuthorized = false;

  let baseGuardrails = null;
  try {
    const baseContent = execFileSync('git', ['show', `${mergeBase}:.agent-room/guardrails.json`], {
      cwd: target,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    baseGuardrails = JSON.parse(baseContent);
  } catch (err) {
    baseGuardrails = null;
  }

  const currentGuardrailsPath = path.join(target, '.agent-room', 'guardrails.json');
  const currentExists = fs.existsSync(currentGuardrailsPath);

  if (baseGuardrails) {
    if (!currentExists || changedFiles.some((f) => f === '.agent-room/guardrails.json' && diffEntries.find((d) => d.file === f)?.status === 'D')) {
      isGuardrailsDeleted = true;
      antiTamperViolations.push(
        `Anti-tamper violation: .agent-room/guardrails.json was deleted in this pull request relative to ${baseRef}.`
      );
    } else {
      let currentGuardrails = {};
      try {
        currentGuardrails = JSON.parse(fs.readFileSync(currentGuardrailsPath, 'utf8'));
      } catch (err) {
        antiTamperViolations.push(`Failed to parse current .agent-room/guardrails.json: ${err.message}`);
      }

      const weakening = detectRuleWeakening(
        baseGuardrails,
        currentGuardrails,
        '.agent-room/guardrails.json'
      );

      if (weakening.length > 0) {
        isGuardrailsWeakened = true;
        for (const w of weakening) antiTamperViolations.push(w);
      }
    }
  }

  if (antiTamperViolations.length > 0) {
    // Check if PR diff has an authorized entry in bypass log
    if (newBypassEntries.length > 0) {
      isBypassAuthorized = true;
      warnings.push(
        `Guardrails rule modification authorized via PR bypass log entry (${newBypassEntries.length} bypass entry logged).`
      );
    } else {
      for (const v of antiTamperViolations) {
        errors.push(
          `${v} (Requires an authorized bypass entry in .agent-room/guardrails-bypass-log.md to merge).`
        );
      }
    }
  }

  // 2. Bypass Log Audit
  const bypassViolations = [];
  const isStrict = Boolean(options.strict);

  for (const entry of newBypassEntries) {
    const hasReason = /\|\s*reason:\s*([^|]+)/i.test(entry);
    const reasonMatch = entry.match(/\|\s*reason:\s*([^|]+)/i);
    const reason = reasonMatch ? reasonMatch[1].trim() : '';

    if (!hasReason || reason.length < 20) {
      if (isStrict) {
        bypassViolations.push(
          `Bypass entry missing required explanation (>= 20 chars): "${entry}"`
        );
      } else {
        warnings.push(`Bypass entry has short or missing reason: "${entry}"`);
      }
    }

    if (isStrict && reason) {
      const hasAuditRef = /\b(?:ticket|issue|ref|jira|approved-by|waiver-approved)\b|#\d+/i.test(reason);
      if (!hasAuditRef) {
        bypassViolations.push(
          `Strict bypass audit failed: reason "${reason}" must include an audit reference (ticket: #123, jira, ref:, approved-by:).`
        );
      }
    }
  }

  for (const bv of bypassViolations) {
    errors.push(bv);
  }

  // 3. PR Session Log Enforcement
  const sessionViolations = [];
  const isScaffoldOrDoc = (file) => {
    return (
      file.startsWith('.agent-room/') ||
      file.startsWith('docs/') ||
      file.endsWith('.md') ||
      file === 'LICENSE' ||
      file === '.gitignore' ||
      file === '.gitattributes'
    );
  };

  const nonScaffoldModified = changedFiles.filter((f) => !isScaffoldOrDoc(f));
  const prSessionFiles = changedFiles.filter(
    (f) =>
      f.startsWith('.agent-room/sessions/') &&
      (f.endsWith('.md') || f.endsWith('.json')) &&
      !f.endsWith('.gitkeep')
  );

  const requireSession =
    nonScaffoldModified.length > 0 &&
    !options.skipPrSessions &&
    !options['skip-pr-sessions'];

  if (requireSession && prSessionFiles.length === 0) {
    sessionViolations.push(
      `PR Session Log Missing: ${nonScaffoldModified.length} code/non-scaffold file(s) modified in this PR, but no session log was added under .agent-room/sessions/. Run "create-agent-room session --record" to record this session.`
    );
    errors.push(sessionViolations[0]);
  }

  return {
    ok: errors.length === 0,
    skipped: false,
    baseRef,
    mergeBase,
    durationMs: Date.now() - t0,
    diffFilesCount: changedFiles.length,
    nonScaffoldModifiedCount: nonScaffoldModified.length,
    antiTamper: {
      ok: antiTamperViolations.length === 0 || isBypassAuthorized,
      deleted: isGuardrailsDeleted,
      weakened: isGuardrailsWeakened,
      authorized: isBypassAuthorized,
      violations: antiTamperViolations,
    },
    bypassAudit: {
      ok: bypassViolations.length === 0,
      newEntriesCount: newBypassEntries.length,
      entries: newBypassEntries,
      violations: bypassViolations,
    },
    sessionAudit: {
      ok: sessionViolations.length === 0,
      required: requireSession,
      sessionsFound: prSessionFiles,
      violations: sessionViolations,
    },
    errors,
    warnings,
  };
}

module.exports = {
  isPathProtected,
  normalizeForbiddenEntry,
  detectRuleWeakening,
  resolveBaseRef,
  auditPullRequest,
};
