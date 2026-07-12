# Design Log #154 — Plugin Package Shipping Validation

## Background

Plugins ship NPM packages with `package.json` controlling what files are included. The `plugin-validator` already checks that contracts appear in `exports`, but doesn't verify that `agent-kit/` directories are included in the `files` array. This caused the `design-system-validator` plugin's `agent-kit/designer/design-system.md` to be silently excluded from the published package.

Related: #39 (Plugin package), #73 (validate command), #85 (agent-kit), #124 (contract consistency), #125 (plugin agent-kit).

## Problem

A plugin can have an `agent-kit/` directory with designer/developer guidance files, but if it's not listed in `package.json` `files`, those files won't be in the npm tarball. There's no validation catching this.

### Concrete example: design-system-validator

```json
// package.json — agent-kit/ NOT listed
"files": ["dist", "plugin.yaml"]
```

```
agent-kit/
  designer/
    design-system.md    ← not shipped
```

## Design

Add a check in `validatePackageJson()` (in `plugin-validator`):

1. If `agent-kit/` directory exists in the plugin root
2. Check that `"agent-kit"` appears in `packageJson.files`
3. If missing → emit warning with suggestion

Warning (not error) because the plugin still functions without agent-kit — it's a documentation/discoverability issue.

## Implementation Plan

1. Add check in `validatePackageJson()` after existing exports checks
2. Add tests for the three cases (missing, present, no agent-kit dir)
3. Fix `design-system-validator` `package.json`

## Verification

- Plugin-validator tests pass
- `yarn validate` in `design-system-validator` produces no warnings about agent-kit
