#!/usr/bin/env node
'use strict';

/**
 * Pre-commit hook for guardrails enforcement
 * Prevents commits that violate project guardrails
 *
 * Checks:
 * - Protected paths: blocks commits to paths requiring approval
 * - Forbidden actions: blocks commits containing dangerous patterns (e.g., hard-coded credentials)
 * - Minimum checks before merge
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const projectRoot = process.cwd();
const guardrailsPath = path.join(projectRoot, '.agent-room', 'guardrails.json');

// Allow override via env variable
const ALLOW_GUARDRAILS_BYPASS = process.env.GUARDRAILS_BYPASS || process.env.SKIP_GUARDRAILS_CHECK;

if (!fs.existsSync(guardrailsPath)) {
  // No guardrails file, allow commit
  process.exit(0);
}

let guardrails = {};
try {
  guardrails = JSON.parse(fs.readFileSync(guardrailsPath, 'utf8'));
} catch (err) {
  console.error(`⚠️  Failed to parse guardrails.json: ${err.message}`);
  process.exit(0);
}

// Get staged files
let stagedFiles = [];
try {
  const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  stagedFiles = output.trim().split('\n').filter(Boolean);
} catch (err) {
  // Not a git repo or no staged files
  process.exit(0);
}

const protectedPaths = guardrails.protectedPaths || [];
const forbiddenPatterns = guardrails.forbiddenActions || [];

let violations = [];

// Check protected paths
for (const file of stagedFiles) {
  for (const protectedPath of protectedPaths) {
    if (isPathProtected(file, protectedPath)) {
      violations.push(`Protected path violation: ${file}`);
    }
  }
}

// Check for forbidden patterns in staged content
for (const file of stagedFiles) {
  if (!fs.existsSync(file)) continue;

  // Skip binary files and very large files
  if (isBinaryFile(file) || fs.statSync(file).size > 1_000_000) {
    continue;
  }

  try {
    // Get staged content (not working tree)
    const stagedContent = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' });

    for (const pattern of forbiddenPatterns) {
      if (pattern.match(/^\/.*\/[gimuy]*$/) || pattern.startsWith('(?:') || pattern.includes('(?:')) {
        // It's a regex
        try {
          const regex = new RegExp(pattern);
          if (regex.test(stagedContent)) {
            violations.push(`Forbidden pattern found in ${file}: ${pattern}`);
          }
        } catch (regexErr) {
          // Invalid regex, skip
        }
      } else {
        // Literal string
        if (stagedContent.includes(pattern)) {
          violations.push(`Forbidden pattern found in ${file}: ${pattern}`);
        }
      }
    }
  } catch (err) {
    // File might not exist in index yet
  }
}

if (violations.length > 0) {
  console.error('');
  console.error('❌ Guardrails Check Failed: Commit violates project guardrails');
  console.error('');
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  console.error('');
  console.error('To bypass guardrails (requires approval), use:');
  console.error('  GUARDRAILS_BYPASS=1 git commit');
  console.error('');

  if (!ALLOW_GUARDRAILS_BYPASS) {
    process.exit(1);
  }

  console.warn('⚠️  Guardrails bypass enabled - proceeding with commit');
}

process.exit(0);

function isPathProtected(filePath, protectedPattern) {
  // Normalize paths for comparison
  const normalized = filePath.replace(/\\/g, '/');
  const pattern = protectedPattern.replace(/\\/g, '/');

  // Handle glob patterns
  if (pattern.includes('*')) {
    const regexPattern = pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${regexPattern}$`).test(normalized);
  }

  // Direct match or prefix match
  return normalized === pattern || normalized.startsWith(pattern + '/');
}

function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.exe', '.dll', '.so', '.bin'];
  return binaryExts.includes(ext);
}
