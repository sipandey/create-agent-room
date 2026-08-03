# Release checklist (npm + CI pin)

The dogfood workflow `.github/workflows/agent-room-validate.yml` installs
`create-agent-room@<version>` from the **npm registry**, not from the checkout.
If you push a release commit that bumps the pin before `npm publish` completes,
`agent-room-validate` fails with:

```
npm error code ETARGET
npm error notarget No matching version found for create-agent-room@X.Y.Z
```

This also happened on the v2.3.0 and v2.3.1 releases.

## Correct order

1. Bump version locally (`package.json`, `npm install`, `action.yml`, dogfood CI pin, `CHANGELOG.md`)
2. `npm run lint && npm test`
3. Commit and tag (`git tag vX.Y.Z`)
4. **`npm publish`** (must succeed before relying on CI pin)
5. `git push origin main && git push origin vX.Y.Z`
6. Move rolling tag if needed: `git tag -f v2 && git push origin v2 --force`
7. `gh release create vX.Y.Z ...`
8. If `agent-room-validate` already ran and failed with `ETARGET`, re-run it:
   `gh run rerun <run-id> --failed`

## Alternative (if publish must happen after push)

Push first, publish npm immediately, then re-run the failed `agent-room-validate`
workflow. Do not leave main red overnight.
