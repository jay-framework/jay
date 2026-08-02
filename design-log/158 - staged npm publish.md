# DL#158 — Staged npm Publish

## Background

The monorepo has ~40 publishable `@jay-framework/*` packages. Previously, publishing required passing an OTP to every `yarn npm publish` call. With 2FA enabled, OTPs expire in 30 seconds — not enough time for sequential publishing of all packages. The old scripts either failed mid-way or required disabling 2FA.

npm introduced a **staging** workflow (npm 11+ / Node 22+, Yarn 4.17+): packages are uploaded without 2FA, then bulk-approved with a single OTP after all uploads complete.

## Problem

1. OTP expires before all packages are published
2. Partial publish leaves the registry in an inconsistent state (some packages updated, others not)
3. Old `publish.cjs` script required `NPM_OTP` env var upfront — wasted if staging took too long

## Design

### Two-phase publish

```
Phase 1: Stage (no OTP)          Phase 2: Approve (single OTP)
┌─────────────────────┐          ┌─────────────────────┐
│ yarn npm publish    │          │ yarn npm stage      │
│   --staged          │  ──────► │   approve <id>      │
│   --access public   │          │   --otp <otp>       │
│   (per workspace)   │          │   (per staged pkg)  │
└─────────────────────┘          └─────────────────────┘
```

### Resumable flow

On start, check for already-staged packages. If found, skip directly to approve. This handles:

- Ctrl-C after staging but before OTP entry
- OTP entered incorrectly — re-run picks up staged packages

### OTP prompt timing

OTP is requested interactively right before the approve step, not as a CLI argument. This maximizes the time window for the OTP to remain valid.

## Implementation

### Script: `scripts/publish-staged.mjs`

```
1. yarn npm whoami          — verify npm login
2. yarn npm stage list      — check for existing staged packages
   ├── found → skip to step 4
   └── empty → continue
3. yarn workspaces foreach -A --no-private --topological-dev
     exec "yarn npm publish --staged --access public --tolerate-republish"
4. yarn npm stage list --json  — collect stage IDs
5. prompt: Enter OTP
6. yarn npm stage approve <id> --otp <otp>  — for each staged package
```

### package.json scripts

```json
{
  "publish": "node scripts/publish-staged.mjs",
  "publish:legacy": "node scripts/publish.cjs"
}
```

Old `publish:interactive` and `publish:manual` removed — the staged flow replaces both.

### Requirements

- Node 22+ (`nvm use v22`)
- Yarn 4.17+ (supports `--staged`, `yarn npm stage list/approve`)

### Key flags

| Flag                   | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `--staged`             | Upload without 2FA, defer to approve step          |
| `--access public`      | Required for `@jay-framework/*` scoped packages    |
| `--tolerate-republish` | Skip already-published versions without error      |
| `--topological-dev`    | Publish dependencies before dependents             |
| `--json`               | NDJSON output from `stage list` for script parsing |

## Trade-offs

| Choice                                               | Pro                                                   | Con                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Interactive OTP prompt vs CLI arg                    | OTP entered at last moment, maximizes validity window | Cannot be fully non-interactive                                      |
| Resume from staged vs always re-stage                | Handles interruptions gracefully                      | Stale staged packages could surprise if left from a previous session |
| Yarn `--staged` vs `yarn pack` + `npm stage publish` | Single tool, resolves `workspace:*` automatically     | Requires Yarn 4.17+                                                  |
