'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

const STICKY_MARKER = '<!-- agent-room-pr-comment -->';

function resolvePrContext(options) {
  options = options || {};
  let fullName = options.repo || options.repository || process.env.GITHUB_REPOSITORY;

  if (!fullName) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: options.target || '.',
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      }).trim();
      const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
      if (match) fullName = `${match[1]}/${match[2]}`;
    } catch (e) {
      // ignore git remote resolution failure
    }
  }

  let owner = null;
  let repo = null;
  if (fullName && fullName.includes('/')) {
    const parts = fullName.split('/');
    owner = parts[0].trim();
    repo = parts[1].trim();
  }

  let prNumber = options.prNumber || options.pr || options['pr-number'];
  if (!prNumber && process.env.GITHUB_EVENT_PATH) {
    try {
      const eventContent = fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8');
      const eventData = JSON.parse(eventContent);
      prNumber = eventData.pull_request?.number || eventData.issue?.number;
    } catch (e) {
      // ignore event file read/parse failure
    }
  }

  if (!prNumber && process.env.CI_MERGE_REQUEST_IID) {
    prNumber = parseInt(process.env.CI_MERGE_REQUEST_IID, 10);
  }

  const token =
    options.token ||
    options.githubToken ||
    options['github-token'] ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN;

  return {
    owner,
    repo,
    fullName,
    prNumber: prNumber ? parseInt(prNumber, 10) : null,
    token: token ? String(token).trim() : null,
  };
}

async function findStickyComment(owner, repo, prNumber, token, marker, options) {
  options = options || {};
  const fetchImpl = options.fetch || globalThis.fetch;
  const baseUrl = (options.apiUrl || 'https://api.github.com').replace(/\/+$/, '');
  const url = `${baseUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`;

  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'create-agent-room',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchImpl(url, { method: 'GET', headers });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to list PR comments (HTTP ${response.status}): ${errText}`);
  }

  const comments = await response.json();
  if (!Array.isArray(comments)) return null;

  for (const c of comments) {
    if (c.body && c.body.includes(marker)) {
      return {
        id: c.id,
        body: c.body,
        url: c.html_url || c.url,
      };
    }
  }
  return null;
}

async function postPrComment(markdownReport, options) {
  options = options || {};
  const fetchImpl = options.fetch || globalThis.fetch;
  const baseUrl = (options.apiUrl || 'https://api.github.com').replace(/\/+$/, '');
  const marker = options.marker || STICKY_MARKER;

  const ctx = resolvePrContext(options);

  if (!ctx.token) {
    return {
      ok: false,
      skipped: true,
      reason: 'no-token',
      message: 'No GitHub token available. Pass --github-token or set GITHUB_TOKEN.',
    };
  }

  if (!ctx.prNumber) {
    return {
      ok: true,
      skipped: true,
      reason: 'no-pr-number',
      message: 'Not running in a PR context or no PR number specified.',
    };
  }

  if (!ctx.owner || !ctx.repo) {
    return {
      ok: false,
      skipped: true,
      reason: 'no-repo',
      message: 'Could not resolve GitHub repository owner and name.',
    };
  }

  const cleanReport = markdownReport.trim();
  const body = cleanReport.includes(marker)
    ? cleanReport
    : `${marker}\n${cleanReport}`;

  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'create-agent-room',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ctx.token}`,
  };

  try {
    const existing = await findStickyComment(ctx.owner, ctx.repo, ctx.prNumber, ctx.token, marker, options);

    if (existing) {
      const updateUrl = `${baseUrl}/repos/${ctx.owner}/${ctx.repo}/issues/comments/${existing.id}`;
      const res = await fetchImpl(updateUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          ok: false,
          action: 'update_failed',
          commentId: existing.id,
          status: res.status,
          error: `HTTP ${res.status}: ${errText}`,
        };
      }

      const updated = await res.json();
      return {
        ok: true,
        action: 'updated',
        commentId: existing.id,
        url: updated.html_url || existing.url,
      };
    }

    // Otherwise create new comment
    const createUrl = `${baseUrl}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`;
    const res = await fetchImpl(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        action: 'create_failed',
        status: res.status,
        error: `HTTP ${res.status}: ${errText}`,
      };
    }

    const created = await res.json();
    return {
      ok: true,
      action: 'created',
      commentId: created.id,
      url: created.html_url || created.url,
    };
  } catch (err) {
    return {
      ok: false,
      action: 'error',
      error: err.message,
    };
  }
}

module.exports = {
  STICKY_MARKER,
  resolvePrContext,
  findStickyComment,
  postPrComment,
};
