'use strict';

const NO_LOG_MIN_REASON_LENGTH = 8;

const WAIVER_RE = /<!--\s*no-log:\s*(.{8,}?)\s*-->/s;

const ENTRY_HEADER_RE = /^###\s+\d{4}-\d{2}-\d{2}\s+—\s+.+/m;

const ANTI_PATTERN_FIELD_RES = [
  /\*\*What happened:\*\*/i,
  /\*\*Root cause:\*\*/i,
  /\*\*Avoid:\*\*/i,
];

const DECISION_FIELD_RES = [/\*\*Decision:\*\*/i, /\*\*Why:\*\*/i];

/**
 * @param {string} diffText unified diff or empty
 * @returns {string}
 */
function extractAddedContent(diffText) {
  if (!diffText || !diffText.trim()) return '';
  return diffText
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

/**
 * @param {string} addedContent
 * @returns {boolean}
 */
function matchesWaiver(addedContent) {
  if (!addedContent || !addedContent.trim()) return false;
  const match = addedContent.match(WAIVER_RE);
  if (!match) return false;
  return match[1].trim().length >= NO_LOG_MIN_REASON_LENGTH;
}

/**
 * @param {string} addedContent
 * @returns {boolean}
 */
function matchesAntiPatternEntry(addedContent) {
  if (!addedContent || !addedContent.trim()) return false;
  if (!ENTRY_HEADER_RE.test(addedContent)) return false;
  return ANTI_PATTERN_FIELD_RES.some((re) => re.test(addedContent));
}

/**
 * @param {string} addedContent
 * @returns {boolean}
 */
function matchesDecisionEntry(addedContent) {
  if (!addedContent || !addedContent.trim()) return false;
  if (!ENTRY_HEADER_RE.test(addedContent)) return false;
  return DECISION_FIELD_RES.every((re) => re.test(addedContent));
}

/**
 * @param {string} addedContent
 * @returns {boolean}
 */
function hasValidLogEvidence(addedContent) {
  return (
    matchesWaiver(addedContent) ||
    matchesAntiPatternEntry(addedContent) ||
    matchesDecisionEntry(addedContent)
  );
}

/**
 * @param {string} diffText git diff output for log file(s)
 * @returns {boolean}
 */
function validateLogEvidenceFromDiff(diffText) {
  return hasValidLogEvidence(extractAddedContent(diffText));
}

function buildEvidenceFailureMessage() {
  return (
    'Closing-the-loop check failed: decisions.md or anti-patterns.md was touched, ' +
    'but the change does not contain valid evidence.\n\n' +
    'Add one of the following in this turn (see .agent-room/skills/closing-the-loop.md):\n' +
    '- A waiver with a real reason (at least 8 characters after no-log:):\n' +
    '  <!-- no-log: routine change, no decision or anti-pattern worth recording -->\n' +
    '- An anti-pattern entry: ### YYYY-MM-DD — title plus **What happened:** / **Root cause:** / **Avoid:**\n' +
    '- A decision entry: ### YYYY-MM-DD — title plus **Decision:** and **Why:**\n'
  );
}

module.exports = {
  NO_LOG_MIN_REASON_LENGTH,
  extractAddedContent,
  matchesWaiver,
  matchesAntiPatternEntry,
  matchesDecisionEntry,
  hasValidLogEvidence,
  validateLogEvidenceFromDiff,
  buildEvidenceFailureMessage,
};
