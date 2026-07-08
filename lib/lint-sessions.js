'use strict';

const fs = require('fs');
const path = require('path');
const { green, yellow, red, cyan, bold } = require('./color');

const REQUIRED_SECTIONS = [
  'Goal',
  'Files touched',
  'Actions taken',
  'Tests run',
  'Decisions made',
  'Outcome'
];

// These are inline fields, not section headers
const REQUIRED_FIELDS = ['Date', 'Agent', 'Classification'];

const VALID_CLASSIFICATIONS = ['Bug', 'Enhancement', 'Feature', 'Product'];
const VALID_OUTCOMES = ['Completed', 'Handed Off', 'In Progress', 'Blocked'];

function validateMarkdownSession(filePath, fileName) {
  const errors = [];
  const warnings = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Check if file is empty or too short
    if (!content.trim()) {
      errors.push(`${fileName}: File is empty`);
      return { errors, warnings };
    }

    // Check for session log title
    if (!content.match(/^#\s+Session Log:/m)) {
      errors.push(`${fileName}: Missing "# Session Log:" header`);
    }

    // Check for required inline fields (Date, Agent, Classification)
    for (const field of REQUIRED_FIELDS) {
      const fieldRegex = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+?)(?:\\n|\\r|$)`, 'i');
      if (!content.match(fieldRegex)) {
        errors.push(`${fileName}: Missing required field "**${field}:**"`);
      }
    }

    // Check for each required section header
    for (const section of REQUIRED_SECTIONS) {
      const sectionRegex = new RegExp(`^##\\s+${section}`, 'm');
      if (!content.match(sectionRegex)) {
        errors.push(`${fileName}: Missing required section "## ${section}"`);
      }
    }

    // Validate Date format
    const dateMatch = content.match(/\*\*Date:\*\*\s*(.+?)(?:\n|\r)/);
    if (!dateMatch || !dateMatch[1].trim()) {
      errors.push(`${fileName}: Date field is empty or malformed`);
    } else {
      const dateStr = dateMatch[1].trim();
      if (!/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(dateStr)) {
        warnings.push(`${fileName}: Date format should be "YYYY-MM-DD HH:MM", got "${dateStr}"`);
      }
    }

    // Validate Agent field
    const agentMatch = content.match(/\*\*Agent:\*\*\s*(.+?)(?:\n|\r)/);
    if (!agentMatch || !agentMatch[1].trim()) {
      errors.push(`${fileName}: Agent field is empty`);
    }

    // Validate Classification
    const classMatch = content.match(/\*\*Classification:\*\*\s*(.+?)(?:\n|\r)/);
    if (!classMatch || !classMatch[1].trim()) {
      errors.push(`${fileName}: Classification field is empty`);
    } else {
      const classification = classMatch[1].trim();
      if (!VALID_CLASSIFICATIONS.includes(classification)) {
        errors.push(`${fileName}: Invalid Classification "${classification}". Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`);
      }
    }

    // Validate Goal (one sentence, not empty)
    const goalMatch = content.match(/##\s+Goal\r?\n+([\s\S]*?)(?=##|$)/);
    if (!goalMatch || !goalMatch[1].trim()) {
      errors.push(`${fileName}: Goal section is empty`);
    } else {
      const goalText = goalMatch[1].trim();
      if (goalText.split('\n').length > 1) {
        warnings.push(`${fileName}: Goal should be one sentence, found multiple lines`);
      }
      if (goalText.length > 200) {
        warnings.push(`${fileName}: Goal is very long (${goalText.length} chars), consider shorter wording`);
      }
    }

    // Validate Files touched (should list something)
    const filesMatch = content.match(/##\s+Files touched\r?\n+([\s\S]*?)(?=##|$)/);
    if (!filesMatch || !filesMatch[1].trim()) {
      warnings.push(`${fileName}: Files touched section is empty (should list Read/Created/Modified)`);
    } else {
      const filesText = filesMatch[1].trim();
      if (!filesText.match(/-(Read|Created|Modified):/i)) {
        warnings.push(`${fileName}: Files touched should use format "- Read: file.js" / "- Created: file.js" / "- Modified: file.js"`);
      }
    }

    // Validate Actions taken (should have at least one action)
    const actionsMatch = content.match(/##\s+Actions taken\r?\n+([\s\S]*?)(?=##|$)/);
    if (!actionsMatch || !actionsMatch[1].trim()) {
      errors.push(`${fileName}: Actions taken section is empty`);
    } else {
      const actionsText = actionsMatch[1].trim();
      if (!actionsText.match(/^\s*\d+\./m)) {
        warnings.push(`${fileName}: Actions should be numbered list (1., 2., etc.)`);
      }
      const actionCount = (actionsText.match(/^\s*\d+\./gm) || []).length;
      if (actionCount === 0) {
        errors.push(`${fileName}: Actions taken should contain numbered steps (found 0)`);
      }
    }

    // Validate Tests run
    const testsMatch = content.match(/##\s+Tests run\r?\n+([\s\S]*?)(?=##|$)/);
    if (!testsMatch || !testsMatch[1].trim()) {
      warnings.push(`${fileName}: Tests run section is empty`);
    }

    // Validate Outcome Status
    const outcomeMatch = content.match(/##\s+Outcome[^#]*\*\*Status:\*\*\s*(.+?)(?:\n|\r)/);
    if (!outcomeMatch || !outcomeMatch[1].trim()) {
      warnings.push(`${fileName}: Outcome Status field is empty or malformed`);
    } else {
      const outcome = outcomeMatch[1].trim();
      if (!VALID_OUTCOMES.includes(outcome)) {
        warnings.push(`${fileName}: Outcome Status should be one of: ${VALID_OUTCOMES.join(', ')}, got "${outcome}"`);
      }
    }

    return { errors, warnings };
  } catch (err) {
    return {
      errors: [`${fileName}: Failed to read or parse: ${err.message}`],
      warnings: []
    };
  }
}

function validateJSONSession(filePath, fileName) {
  const errors = [];
  const warnings = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Check required fields
    const requiredFields = ['date', 'agent', 'classification', 'goal', 'outcome'];
    for (const field of requiredFields) {
      if (!data[field]) {
        errors.push(`${fileName}: Missing required field "${field}"`);
      } else if (typeof data[field] === 'string' && !data[field].trim()) {
        errors.push(`${fileName}: Required field "${field}" is empty`);
      }
    }

    // Validate classification
    if (data.classification && !VALID_CLASSIFICATIONS.includes(data.classification)) {
      errors.push(`${fileName}: Invalid classification "${data.classification}". Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`);
    }

    // Validate outcome
    if (data.outcome && !VALID_OUTCOMES.includes(data.outcome)) {
      warnings.push(`${fileName}: Outcome should be one of: ${VALID_OUTCOMES.join(', ')}, got "${data.outcome}"`);
    }

    // Check actions
    if (!data.actions || (Array.isArray(data.actions) && data.actions.length === 0)) {
      errors.push(`${fileName}: Actions should be a non-empty array`);
    }

    return { errors, warnings };
  } catch (err) {
    return {
      errors: [`${fileName}: Failed to parse JSON: ${err.message}`],
      warnings: []
    };
  }
}

function runLintSessions(target) {
  console.log(bold(`Linting session logs in: ${cyan(target)}\n`));

  const sessionsDir = path.join(target, '.agent-room', 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    console.log(yellow(`⚠️  No sessions directory found at ${sessionsDir}`));
    return;
  }

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.md') || f.endsWith('.json'));

  if (files.length === 0) {
    console.log(yellow(`⚠️  No session logs found in ${sessionsDir}`));
    return;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    let result;

    if (file.endsWith('.md')) {
      result = validateMarkdownSession(filePath, file);
    } else if (file.endsWith('.json')) {
      result = validateJSONSession(filePath, file);
    } else {
      continue;
    }

    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;

    results.push({ file, ...result });
  }

  // Output results
  let hasFailed = false;

  for (const result of results) {
    if (result.errors.length > 0 || result.warnings.length > 0) {
      console.log(`${bold(result.file)}`);

      if (result.errors.length > 0) {
        hasFailed = true;
        for (const err of result.errors) {
          console.log(red(`  ❌ ${err}`));
        }
      }

      if (result.warnings.length > 0) {
        for (const warn of result.warnings) {
          console.log(yellow(`  ⚠️  ${warn}`));
        }
      }

      console.log('');
    }
  }

  // Summary
  console.log(bold('Summary:'));
  console.log(`  Files scanned: ${files.length}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Warnings: ${totalWarnings}`);

  if (hasFailed) {
    console.log('');
    console.log(red('Linting FAILED: Some session logs have validation errors.'));
    process.exitCode = 1;
  } else if (totalWarnings > 0) {
    console.log('');
    console.log(bold(yellow('Linting PASSED with warnings.')));
  } else {
    console.log('');
    console.log(bold(green('Linting PASSED! All session logs are valid.')));
  }
}

module.exports = {
  runLintSessions,
  validateMarkdownSession,
  validateJSONSession
};
