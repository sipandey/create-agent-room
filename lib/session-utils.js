'use strict';

/**
 * Session state utilities for agents
 * Provides helpers to create, read, and manage session logs
 *
 * Usage:
 *   const session = require('./.agent-room/utils/session-utils');
 *   const log = session.createLog({
 *     goal: 'Add user API',
 *     classification: 'Feature'
 *   });
 *   log.addAction('Designed database schema');
 *   log.addFile('created', 'schema.sql');
 *   log.save();
 */

const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(process.cwd(), '.agent-room', 'sessions');

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}-${minutes}`;
}

class SessionLog {
  constructor(options = {}) {
    this.timestamp = generateTimestamp();
    this.date = new Date().toISOString().slice(0, 16).replace('T', ' ');
    this.agent = options.agent || 'Unknown Agent';
    this.classification = options.classification || 'Enhancement';
    this.goal = options.goal || '';
    this.actions = [];
    this.files = { read: [], created: [], modified: [] };
    this.tests = { command: '', result: '' };
    this.decisions = [];
    this.outcome = 'In Progress';
    this.handoffNote = '';
    this.topic = options.topic || 'session';
  }

  addAction(description) {
    this.actions.push(description);
    return this;
  }

  addFile(type, filePath) {
    if (['read', 'created', 'modified'].includes(type)) {
      this.files[type].push(filePath);
    }
    return this;
  }

  addDecision(decision) {
    this.decisions.push(decision);
    return this;
  }

  setTests(command, result) {
    this.tests.command = command;
    this.tests.result = result;
    return this;
  }

  complete(handoffNote = '') {
    this.outcome = 'Completed';
    this.handoffNote = handoffNote;
    return this;
  }

  handOff(handoffNote = '') {
    this.outcome = 'Handed Off';
    this.handoffNote = handoffNote;
    return this;
  }

  toMarkdown() {
    const files = [];
    if (this.files.read.length > 0) {
      files.push(`- Read: ${this.files.read.join(', ')}`);
    }
    if (this.files.created.length > 0) {
      files.push(`- Created: ${this.files.created.join(', ')}`);
    }
    if (this.files.modified.length > 0) {
      files.push(`- Modified: ${this.files.modified.join(', ')}`);
    }

    const actions = this.actions.map((a, i) => `${i + 1}. ${a}`).join('\n');

    const decisions = this.decisions.length > 0 ? this.decisions.map((d) => `- ${d}`).join('\n') : 'None documented.';

    const handoff = this.handoffNote ? `\n**Handoff note (if applicable):**\n${this.handoffNote}` : '';

    return `# Session Log: ${this.topic}

**Date:** ${this.date}
**Agent:** ${this.agent}
**Classification:** ${this.classification}

## Goal
${this.goal}

## Files touched
${files.length > 0 ? files.join('\n') : 'None'}

## Actions taken
${actions}

## Tests run
Command: ${this.tests.command}
Result: ${this.tests.result}

## Decisions made
${decisions}

## Outcome
**Status:** ${this.outcome}${handoff}
`;
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      date: this.date,
      agent: this.agent,
      classification: this.classification,
      goal: this.goal,
      actions: this.actions,
      files: this.files,
      tests: this.tests,
      decisions: this.decisions,
      outcome: this.outcome,
      handoffNote: this.handoffNote
    };
  }

  save(format = 'markdown') {
    ensureSessionDir();

    const fileName = `${this.timestamp}-${this.topic.replace(/\s+/g, '-').toLowerCase()}`;
    const ext = format === 'json' ? '.json' : '.md';
    const filePath = path.join(SESSION_DIR, fileName + ext);

    let content;
    if (format === 'json') {
      content = JSON.stringify(this.toJSON(), null, 2);
    } else {
      content = this.toMarkdown();
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return { path: filePath, relativePath: path.relative(process.cwd(), filePath) };
  }
}

/**
 * Create a new session log
 * @param {Object} options - Configuration
 * @param {string} options.goal - The session goal
 * @param {string} options.agent - Agent name (default: "Unknown Agent")
 * @param {string} options.classification - Bug, Enhancement, Feature, or Product (default: "Enhancement")
 * @param {string} options.topic - Topic for filename (default: "session")
 * @returns {SessionLog}
 */
function createLog(options = {}) {
  return new SessionLog(options);
}

/**
 * List all session logs
 * @returns {Array} List of session log paths
 */
function listSessions() {
  ensureSessionDir();
  if (!fs.existsSync(SESSION_DIR)) {
    return [];
  }
  return fs.readdirSync(SESSION_DIR)
    .filter((f) => f.endsWith('.md') || f.endsWith('.json'))
    .map((f) => path.join(SESSION_DIR, f));
}

/**
 * Get the latest session log
 * @returns {string|null} Path to latest session log or null if none exist
 */
function getLatestSession() {
  const sessions = listSessions();
  if (sessions.length === 0) return null;
  return sessions.sort().reverse()[0];
}

module.exports = {
  createLog,
  SessionLog,
  listSessions,
  getLatestSession,
  generateTimestamp
};
