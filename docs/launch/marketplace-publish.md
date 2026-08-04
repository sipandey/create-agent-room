# Publish create-agent-room to GitHub Marketplace

The composite Action (`action.yml`) is written, tested, and pinned.

**Status (2026-08-03):** already listed at
[create-agent-room Validate on GitHub Marketplace](https://github.com/marketplace/actions/create-agent-room-validate)
(first published around v2.0.0/v2.0.1). You will **not** see “Publish this
Action to GitHub Marketplace” on a release **view** page for an Action that is
already published — that banner/checkbox is for the **first** publish (or when
**editing** a release / drafting from `action.yml`).

## If the release page has no Marketplace button

You are likely already done. Confirm:

1. Open https://github.com/marketplace/actions/create-agent-room-validate
2. Check the version shown (should match latest tag, e.g. `v2.3.1`)
3. Consumers can use `uses: sipandey/create-agent-room@v2`

To attach a **new** tag to Marketplace after a release was created without the
checkbox:

1. Open the release → **Edit** (pencil icon)
2. Look for **“Publish this Action to GitHub Marketplace”** under Release Action
3. Ensure it is checked → **Update release**

If the checkbox is missing or disabled:

- Accept the [GitHub Marketplace Developer Agreement](https://github.com/marketplace/new)
  (owner account, 2FA required)
- Open `action.yml` on `main` — GitHub may show a **“Draft a release”** banner
  at the top of the file view
- Rare: `action.yml` ↔ `action.yaml` rename bug — contact GitHub Support

## First-time publish (historical checklist)

The composite Action (`action.yml`) is written, tested, and documented
(`docs/github-action.md`). Publishing is a **human step** in the GitHub UI.

### Prerequisites

- [ ] Version bumped and tested locally (see `release-checklist.md`)
- [ ] **`npm publish` succeeded** before relying on the dogfood CI pin
- [ ] vX.Y.Z tagged and pushed to `main`
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
