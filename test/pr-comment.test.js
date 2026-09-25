'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const {
  STICKY_MARKER,
  resolvePrContext,
  findStickyComment,
  postPrComment,
} = require('../lib/pr-comment');

test('resolvePrContext: extracts repo, prNumber, and token from options', () => {
  const ctx = resolvePrContext({
    repo: 'sipandey/my-repo',
    prNumber: 42,
    token: 'ghp_secret123',
  });

  assert.strictEqual(ctx.owner, 'sipandey');
  assert.strictEqual(ctx.repo, 'my-repo');
  assert.strictEqual(ctx.fullName, 'sipandey/my-repo');
  assert.strictEqual(ctx.prNumber, 42);
  assert.strictEqual(ctx.token, 'ghp_secret123');
});

test('resolvePrContext: extracts from environment variables and event path', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-event-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const eventFile = path.join(tmpDir, 'event.json');
  fs.writeFileSync(eventFile, JSON.stringify({ pull_request: { number: 99 } }));

  const origRepo = process.env.GITHUB_REPOSITORY;
  const origEvent = process.env.GITHUB_EVENT_PATH;
  const origToken = process.env.GITHUB_TOKEN;

  process.env.GITHUB_REPOSITORY = 'acme/widgets';
  process.env.GITHUB_EVENT_PATH = eventFile;
  process.env.GITHUB_TOKEN = 'ghp_envtoken456';

  try {
    const ctx = resolvePrContext();
    assert.strictEqual(ctx.owner, 'acme');
    assert.strictEqual(ctx.repo, 'widgets');
    assert.strictEqual(ctx.prNumber, 99);
    assert.strictEqual(ctx.token, 'ghp_envtoken456');
  } finally {
    if (origRepo !== undefined) process.env.GITHUB_REPOSITORY = origRepo;
    else delete process.env.GITHUB_REPOSITORY;
    if (origEvent !== undefined) process.env.GITHUB_EVENT_PATH = origEvent;
    else delete process.env.GITHUB_EVENT_PATH;
    if (origToken !== undefined) process.env.GITHUB_TOKEN = origToken;
    else delete process.env.GITHUB_TOKEN;
  }
});

test('findStickyComment: returns matching comment or null', async () => {
  // Test comment found
  const mockComments = [
    { id: 101, body: 'LGTM!', html_url: 'https://github.com/a/b/issues/1#issuecomment-101' },
    {
      id: 202,
      body: `${STICKY_MARKER}\n## CI Scorecard`,
      html_url: 'https://github.com/a/b/issues/1#issuecomment-202',
    },
  ];

  const mockFetchFound = async (url) => {
    assert(url.includes('/repos/owner/repo/issues/1/comments'));
    return {
      ok: true,
      status: 200,
      json: async () => mockComments,
    };
  };

  const found = await findStickyComment('owner', 'repo', 1, 'token', STICKY_MARKER, {
    fetch: mockFetchFound,
  });

  assert.ok(found);
  assert.strictEqual(found.id, 202);
  assert(found.body.includes(STICKY_MARKER));
  assert.strictEqual(found.url, 'https://github.com/a/b/issues/1#issuecomment-202');

  // Test comment not found
  const mockFetchNotFound = async () => ({
    ok: true,
    status: 200,
    json: async () => [{ id: 303, body: 'Just a regular comment' }],
  });

  const notFound = await findStickyComment('owner', 'repo', 1, 'token', STICKY_MARKER, {
    fetch: mockFetchNotFound,
  });
  assert.strictEqual(notFound, null);
});

test('findStickyComment: throws on HTTP error', async () => {
  const mockFetchError = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Bad credentials',
  });

  await assert.rejects(
    () => findStickyComment('owner', 'repo', 1, 'bad-token', STICKY_MARKER, { fetch: mockFetchError }),
    /Failed to list PR comments \(HTTP 401\)/
  );
});

test('postPrComment: skips when token or PR number is missing', async () => {
  const resNoToken = await postPrComment('Report', { repo: 'a/b', prNumber: 1 });
  assert.strictEqual(resNoToken.ok, false);
  assert.strictEqual(resNoToken.skipped, true);
  assert.strictEqual(resNoToken.reason, 'no-token');

  const resNoPr = await postPrComment('Report', { repo: 'a/b', token: 'tok' });
  assert.strictEqual(resNoPr.ok, true);
  assert.strictEqual(resNoPr.skipped, true);
  assert.strictEqual(resNoPr.reason, 'no-pr-number');
});

test('postPrComment: creates new comment via POST when sticky comment does not exist', async () => {
  let createdPayload = null;
  let postUrl = null;

  const mockFetch = async (url, opts) => {
    if (opts.method === 'GET') {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (opts.method === 'POST') {
      postUrl = url;
      createdPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 505, html_url: 'https://github.com/a/b/issues/10#issuecomment-505' }),
      };
    }
    throw new Error(`Unexpected call: ${opts.method} ${url}`);
  };

  const res = await postPrComment('## CI Report\nAll passed', {
    repo: 'sipandey/create-agent-room',
    prNumber: 10,
    token: 'fake-token',
    fetch: mockFetch,
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.action, 'created');
  assert.strictEqual(res.commentId, 505);
  assert.strictEqual(res.url, 'https://github.com/a/b/issues/10#issuecomment-505');
  assert(postUrl.endsWith('/repos/sipandey/create-agent-room/issues/10/comments'));
  assert(createdPayload.body.includes(STICKY_MARKER));
  assert(createdPayload.body.includes('## CI Report'));
});

test('postPrComment: updates existing comment via PATCH when sticky comment exists', async () => {
  let patchUrl = null;
  let patchedPayload = null;

  const mockFetch = async (url, opts) => {
    if (opts.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 808,
            body: `${STICKY_MARKER}\nOld CI Report`,
            html_url: 'https://github.com/a/b/issues/10#issuecomment-808',
          },
        ],
      };
    }
    if (opts.method === 'PATCH') {
      patchUrl = url;
      patchedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 808, html_url: 'https://github.com/a/b/issues/10#issuecomment-808' }),
      };
    }
    throw new Error(`Unexpected call: ${opts.method} ${url}`);
  };

  const res = await postPrComment('## Updated CI Report\nAll passed', {
    repo: 'sipandey/create-agent-room',
    prNumber: 10,
    token: 'fake-token',
    fetch: mockFetch,
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.action, 'updated');
  assert.strictEqual(res.commentId, 808);
  assert.strictEqual(res.url, 'https://github.com/a/b/issues/10#issuecomment-808');
  assert(patchUrl.endsWith('/repos/sipandey/create-agent-room/issues/comments/808'));
  assert(patchedPayload.body.includes(STICKY_MARKER));
  assert(patchedPayload.body.includes('## Updated CI Report'));
});

test('postPrComment: handles API 403 Forbidden gracefully without crashing', async () => {
  const mockFetchForbidden = async (url, opts) => {
    if (opts.method === 'GET') {
      return { ok: true, status: 200, json: async () => [] };
    }
    return {
      ok: false,
      status: 403,
      text: async () => 'Resource not accessible by integration',
    };
  };

  const res = await postPrComment('## CI Report', {
    repo: 'sipandey/create-agent-room',
    prNumber: 10,
    token: 'readonly-token',
    fetch: mockFetchForbidden,
  });

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.action, 'create_failed');
  assert.strictEqual(res.status, 403);
  assert(res.error.includes('Resource not accessible by integration'));
});
