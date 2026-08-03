# Publish create-agent-room to GitHub Marketplace

The composite Action (`action.yml`) is written, tested, and pinned. Publishing
is a **one-time human step** in the GitHub UI (cannot be fully automated from
CI).

## Prerequisites

- [ ] Version bumped and tested locally (see `release-checklist.md`)
- [ ] **`npm publish` succeeded** before relying on the dogfood CI pin
- [ ] v2.3.1 tagged and pushed to `main`
- [ ] `git tag v2.3.1` points at the release commit
- [ ] Rolling major tag `v2` updated to the release commit:
  `git tag -f v2 && git push origin v2 --force` (Marketplace consumers pin `@v2`)

## Steps

1. Open https://github.com/sipandey/create-agent-room/releases
2. Find the **v2.3.1** release (or create it via `gh release create` first)
3. On the release page, click **"Publish this Action to GitHub Marketplace"**
4. Fill the form:
   - **Name:** `create-agent-room Validate` (matches `action.yml`)
   - **Description:** Use the 125-char limit text from `action.yml` `description`
     field — longer copy lives in `docs/github-action.md`
   - **Category:** Code quality (or Developer tools)
   - **Pricing:** Free
5. Submit and wait for GitHub review (usually minutes for public Actions)

## Verify after publish

```yaml
# In any repo with an agent-room scaffold:
- uses: sipandey/create-agent-room@v2
```

Confirm the Marketplace listing shows v2.3.1 as latest and the Action runs
`validate` + `lint-sessions` successfully.

## Note

The Marketplace Action runs **validate + lint-sessions only**. The
`init --tools git` scaffold also runs `eval` (Layer 4). Document this in the
listing FAQ if GitHub allows extended description elsewhere.
