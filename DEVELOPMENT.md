# Development Guide

## Branching Strategy

```
main              ← stable only, tagged releases
  └─ feature/xxx  ← new features
  └─ fix/xxx      ← bug fixes
  └─ test/xxx     ← experiments
```

Never commit directly to `main`. Always branch, build, test, then merge.

---

## Daily Workflow

```bash
# Start work
git checkout -b feature/my-thing

# Develop...
npm run dev           # watch mode, rebuilds on save

# Before merging
npm test              # pure logic tests
npm run typecheck     # TypeScript strict check
npm run build         # full production build

# Merge and tag
git checkout main
git merge feature/my-thing
git tag v1.2.0
git push origin main --tags
```

---

## Versioning

Format: `vMAJOR.MINOR.PATCH`

| Bump | When |
|---|---|
| `patch` | Bug fix, nothing new |
| `minor` | New feature, nothing breaks |
| `major` | Breaking change or big release |

To restore a previous version:
```bash
git checkout v1.0.0
npm run build
# load dist/ in Chrome
```

---

## Testing

```bash
npm test          # runs tests/
npm run typecheck # TypeScript check, no emit
```

Tests live in `tests/*.test.mjs` and cover pure functions (no browser required):
- `isArrivalAllowed` — arrival window logic
- `generateKey` — license key format and uniqueness
- `normalizeCoordsForFingerprint` — coord deduplication and sorting

When adding new pure logic to userscripts, add a corresponding test.

---

## Environments

Chrome extensions have no staging server — environments are separate `dist/` loads.

| Environment | How |
|---|---|
| **Dev** | `npm run dev` → load unpacked `dist/` in Chrome (live rebuilds) |
| **Staging** | `npm run build` → load unpacked, test manually before tagging |
| **Production** | Same `dist/` zipped and sent to users |

---

## Release Checklist

Before tagging a release:

- [ ] `npm test` — all green
- [ ] `npm run typecheck` — no errors
- [ ] `npm run build` — builds clean
- [ ] Load `dist/` in Chrome, open a TW page, confirm modules run
- [ ] `git tag vX.Y.Z && git push origin main --tags`
