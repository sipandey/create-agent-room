'use strict';

const fs = require('fs');
const path = require('path');

// Pure structural/schema checks for a scaffolded room: no console output, no
// process.exitCode, no writes. Returns { errors, warnings } so callers decide
// how to present them - lib/validate.js prints these as a CI pass/fail gate,
// lib/doctor.js folds them into a broader advisory report alongside its own
// drift/config checks. Keeping this pure (and shared) means the two callers
// can never silently drift apart on what actually counts as broken.
function collectFindings(target) {
  const errors = [];
  const warnings = [];

  const checkFile = (relPath, required = true) => {
    const fullPath = path.join(target, relPath);
    if (!fs.existsSync(fullPath)) {
      if (required) {
        errors.push(`Missing required file: ${relPath}`);
      } else {
        warnings.push(`Recommended file not found: ${relPath}`);
      }
      return false;
    }
    return true;
  };

  const checkDir = (relPath, required = true) => {
    const fullPath = path.join(target, relPath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      if (required) {
        errors.push(`Missing required directory: ${relPath}`);
      } else {
        warnings.push(`Recommended directory not found: ${relPath}`);
      }
      return false;
    }
    return true;
  };

  // 1. Check Directory and Files Structure
  checkFile('AGENTS.md');
  checkFile('.agent-room.json');
  checkDir('.agent-room');

  // principles.md/workflow-classifier.md/coordination/ are only scaffolded
  // under `--profile full` - `--profile minimal` (the default) deliberately
  // skips them. Read the profile the room was actually scaffolded with from
  // .agent-room.json so a minimal room doesn't get flagged for correctly not
  // having files it never claimed to have. Missing/unreadable
  // .agent-room.json (e.g. a room scaffolded before --profile existed)
  // defaults to "full", since that was the only behavior before this field
  // existed.
  let scaffoldedProfile = 'full';
  const configPath = path.join(target, '.agent-room.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const prof = config.preset || config.profile;
      if (prof && typeof prof === 'string') {
        scaffoldedProfile = prof.toLowerCase();
      }
      if (config.preset && !['minimal', 'standard', 'full', 'strict'].includes(config.preset.toLowerCase())) {
        errors.push(`Invalid preset in .agent-room.json: "${config.preset}". Valid: minimal, standard, strict`);
      }
      if (config.hooks !== undefined) {
        if (typeof config.hooks !== 'object' || config.hooks === null || Array.isArray(config.hooks)) {
          errors.push('.agent-room.json property "hooks" must be an object');
        } else if (config.hooks.prePush !== undefined) {
          const pp = config.hooks.prePush;
          if (typeof pp !== 'object' || pp === null || Array.isArray(pp)) {
            errors.push('.agent-room.json property "hooks.prePush" must be an object');
          } else {
            if (pp.enabled !== undefined && typeof pp.enabled !== 'boolean') {
              errors.push('.agent-room.json property "hooks.prePush.enabled" must be a boolean');
            }
            if (pp.strict !== undefined && typeof pp.strict !== 'boolean') {
              errors.push('.agent-room.json property "hooks.prePush.strict" must be a boolean');
            }
            if (pp.skip !== undefined && !Array.isArray(pp.skip) && typeof pp.skip !== 'string') {
              errors.push('.agent-room.json property "hooks.prePush.skip" must be an array or string');
            }
            if (pp.only !== undefined && !Array.isArray(pp.only) && typeof pp.only !== 'string') {
              errors.push('.agent-room.json property "hooks.prePush.only" must be an array or string');
            }
            if (pp.base !== undefined && typeof pp.base !== 'string') {
              errors.push('.agent-room.json property "hooks.prePush.base" must be a string');
            }
          }
        }
      }
    } catch (err) {
      // Malformed .agent-room.json - fall back to the safe "full" default;
      // the JSON itself isn't what this function validates.
    }
  }
  const fullProfileFilesRequired = scaffoldedProfile !== 'minimal';

  if (fs.existsSync(path.join(target, '.agent-room'))) {
    checkFile('.agent-room/principles.md', fullProfileFilesRequired);
    checkFile('.agent-room/workflow-classifier.md', fullProfileFilesRequired);
    checkFile('.agent-room/guardrails.md');
    checkFile('.agent-room/guardrails.json');
    checkFile('.agent-room/anti-patterns.md');
    checkFile('.agent-room/decisions.md');

    // Check coordination structure
    if (checkDir('.agent-room/coordination', fullProfileFilesRequired)) {
      checkFile('.agent-room/coordination/handoff-protocol.md', fullProfileFilesRequired);
      checkFile('.agent-room/coordination/scope-boundaries.md', fullProfileFilesRequired);
      checkFile('.agent-room/coordination/session-log-format.md', fullProfileFilesRequired);
    }

    checkDir('.agent-room/sessions');

    // 2. Validate guardrails.json Configuration
    const guardrailsPath = path.join(target, '.agent-room/guardrails.json');
    if (fs.existsSync(guardrailsPath)) {
      try {
        const content = fs.readFileSync(guardrailsPath, 'utf8');
        const data = JSON.parse(content);

        const requiredArrays = ['protectedPaths', 'requireApprovalFor', 'forbiddenActions'];
        for (const prop of requiredArrays) {
          if (!data[prop]) {
            errors.push(`guardrails.json is missing required property: ${prop}`);
          } else if (!Array.isArray(data[prop])) {
            errors.push(`guardrails.json property "${prop}" must be an array`);
          }
        }

        // forbiddenActions entries must be { pattern, type: "regex"|"literal", description }
        // objects so the pre-commit hook can match on them deterministically instead of
        // guessing regex-vs-literal from string shape. Legacy flat strings are still
        // accepted by the hook for backward compatibility, but flagged here as a warning
        // since they carry no working detection pattern by default.
        if (Array.isArray(data.forbiddenActions)) {
          data.forbiddenActions.forEach((entry, idx) => {
            if (typeof entry === 'string') {
              warnings.push(
                `guardrails.json forbiddenActions[${idx}] uses the legacy flat-string format; ` +
                'migrate to { "pattern", "type", "description" } for real detection'
              );
              return;
            }
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              errors.push(`guardrails.json forbiddenActions[${idx}] must be an object with "pattern" and "type"`);
              return;
            }
            if (typeof entry.pattern !== 'string' || !entry.pattern.trim()) {
              errors.push(`guardrails.json forbiddenActions[${idx}] is missing a non-empty "pattern" string`);
            }
            if (entry.type !== 'regex' && entry.type !== 'literal') {
              errors.push(`guardrails.json forbiddenActions[${idx}].type must be "regex" or "literal"`);
            } else if (entry.type === 'regex' && typeof entry.pattern === 'string') {
              try {
                // eslint-disable-next-line no-new
                new RegExp(entry.pattern);
              } catch (err) {
                errors.push(`guardrails.json forbiddenActions[${idx}].pattern is not a valid regex: ${err.message}`);
              }
            }
          });
        }

        if (data.scopeBoundaries !== undefined) {
          if (
            typeof data.scopeBoundaries !== 'object' ||
            data.scopeBoundaries === null ||
            Array.isArray(data.scopeBoundaries)
          ) {
            errors.push('guardrails.json property "scopeBoundaries" must be an object');
          } else {
            if (
              data.scopeBoundaries.allowedPaths !== undefined &&
              !Array.isArray(data.scopeBoundaries.allowedPaths)
            ) {
              errors.push('guardrails.json property "scopeBoundaries.allowedPaths" must be an array');
            }
            if (data.scopeBoundaries.disallowedCrossBoundaries !== undefined) {
              if (!Array.isArray(data.scopeBoundaries.disallowedCrossBoundaries)) {
                errors.push('guardrails.json property "scopeBoundaries.disallowedCrossBoundaries" must be an array');
              } else {
                data.scopeBoundaries.disallowedCrossBoundaries.forEach((group, idx) => {
                  if (!Array.isArray(group) || group.length < 2) {
                    errors.push(
                       `guardrails.json scopeBoundaries.disallowedCrossBoundaries[${idx}] must be an array with at least 2 pattern strings`
                    );
                  }
                });
              }
            }
          }
        }

        if (data.importBoundaries !== undefined) {
          if (!Array.isArray(data.importBoundaries)) {
            errors.push('guardrails.json property "importBoundaries" must be an array');
          } else {
            data.importBoundaries.forEach((rule, idx) => {
              if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
                errors.push(`guardrails.json importBoundaries[${idx}] must be an object`);
                return;
              }
              if (typeof rule.source !== 'string' || !rule.source.trim()) {
                errors.push(`guardrails.json importBoundaries[${idx}] must have a non-empty "source" pattern string`);
              }
              const disallowed = rule.disallowed || rule.forbiddenImports;
              if (!disallowed || !Array.isArray(disallowed) || disallowed.length === 0) {
                errors.push(`guardrails.json importBoundaries[${idx}] must have a non-empty "disallowed" array`);
              }
            });
          }
        }
      } catch (err) {
        errors.push(`Failed to parse guardrails.json: ${err.message}`);
      }
    }

    // 3. Lint Markdown Skill Files
    const skillsDir = path.join(target, '.agent-room/skills');
    if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
      const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'));
      if (files.length === 0) {
        warnings.push('No skill files found under .agent-room/skills/');
      }

      for (const file of files) {
        const filePath = path.join(skillsDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');

          // Parse YAML Frontmatter
          const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
          const match = content.match(fmRegex);

          if (!match) {
            errors.push(`Skill file "${path.join('.agent-room/skills', file)}" is missing valid YAML frontmatter delimiters (---)`);
            continue;
          }

          const fmContent = match[1];
          const lines = fmContent.split(/\r?\n/);
          const metadata = {};

          for (const line of lines) {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex !== -1) {
              const key = line.slice(0, separatorIndex).trim();
              const val = line.slice(separatorIndex + 1).trim();
              metadata[key] = val;
            }
          }

          if (!metadata.name) {
            errors.push(`Skill file "${path.join('.agent-room/skills', file)}" is missing the "name" metadata attribute in its frontmatter`);
          } else {
            const cleanName = metadata.name.replace(/['"]/g, '').trim();
            if (!cleanName) {
              errors.push(`Skill file "${path.join('.agent-room/skills', file)}" has an empty "name" attribute`);
            }
          }

          if (!metadata.description) {
            errors.push(`Skill file "${path.join('.agent-room/skills', file)}" is missing the "description" metadata attribute in its frontmatter`);
          } else {
            const cleanDesc = metadata.description.replace(/['"]/g, '').trim();
            if (!cleanDesc) {
              errors.push(`Skill file "${path.join('.agent-room/skills', file)}" has an empty "description" attribute`);
            }
          }
        } catch (err) {
          errors.push(`Failed to read or parse skill file ${file}: ${err.message}`);
        }
      }
    }
  }

  return { errors, warnings };
}

module.exports = { collectFindings };
