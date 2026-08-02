# DL#160 — Deprecate Editor Packages

## Background

Three packages exist from the original editor integration (DL#42):

- `@jay-framework/editor-client` — client-side editor communication
- `@jay-framework/editor-protocol` — shared types for editor ↔ server messages
- `@jay-framework/editor-server` — WebSocket server for editor connections

These were designed for the Figma design tool integration. The AIditor has since replaced this workflow — it operates directly on jay-html files without the editor protocol layer.

## Current Usage

| Package         | Dependents                  | Actual code usage                                                                                                                                    |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| editor-client   | none                        | none                                                                                                                                                 |
| editor-protocol | stack-cli, plugin-validator | stack-cli: Figma vendor types (`FigmaVendorDocument`, `ProjectPage`, `Plugin`, `ContractTag`). plugin-validator: vite external only, no code imports |
| editor-server   | stack-cli                   | `stack-cli/lib/server.ts`: `createEditorServer()`                                                                                                    |

All usage is in stack-cli's Figma vendor integration (`lib/vendors/figma/`, `lib/editor-handlers.ts`, `lib/server.ts`). The dev-server has no editor dependencies.

## Plan

### Phase 1: Move packages

1. Move `packages/jay-stack/editor-client` → `packages/_deprecated/editor-client`
2. Move `packages/jay-stack/editor-protocol` → `packages/_deprecated/editor-protocol`
3. Move `packages/jay-stack/editor-server` → `packages/_deprecated/editor-server`

### Phase 2: Remove from stack-cli

1. Remove `@jay-framework/editor-server` dependency from stack-cli
2. Remove `lib/server.ts` (editor WebSocket server)
3. Remove `lib/editor-handlers.ts`
4. Remove `lib/vendors/` directory (Figma vendor converters) — or keep if vendor types can be inlined
5. Remove editor-related tests (`test/vendors/`)
6. Remove `@jay-framework/editor-protocol` external from `vite.config.ts`

### Phase 3: Remove from plugin-validator

1. Remove `@jay-framework/editor-protocol` dependency
2. Remove from `vite.config.ts` externals

### Phase 4: Stop publishing

1. Remove editor packages from publish scripts / CI
2. Mark as deprecated on npm if already published

## Verification

1. `yarn build` succeeds without editor packages
2. `yarn test` passes
3. `jay-stack dev` works without editor server
4. `jay-stack validate` works without editor types
