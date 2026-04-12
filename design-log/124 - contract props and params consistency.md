# Design Log #124 — Contract Props and Params Consistency

## Background

Contracts are the source of truth for the shape of a component. When a component accepts props (e.g., `productId`) or params (e.g., `slug`), these must be declared in the `.jay-contract` file. Without this, the agent-kit and validate tools cannot verify correctness, and AI agents generating pages may omit or mismatch props/params.

Related design logs: #38 (Contract File), #84 (headless props), #113 (explicit route params).

## Problem

Components in consumer projects (e.g., the Wix mono repo) have contracts that are missing `props` and `params` declarations, even though the component implementation requires them. The agent-kit template already documents how to read and declare props/params in contracts, so the gap is in validation — nothing enforces consistency.

### Gap: Validate commands don't check component-contract consistency for props/params

The `jay-stack validate` command checks that route segments satisfy contract params (the `checkRouteParams` function), but there is no check in the other direction — ensuring that a component's implementation (its `loadParams`, `props` in the headless script) is consistent with what the contract declares.

The `jay-stack validate-plugin` command validates almost nothing about the component — just that the export name is a valid string, not a path.

Neither command checks:

- That a component accepting props has those props declared in its contract
- That a component using params has those params declared in its contract
- That contract props/params match the component's actual function signature

**Files**:

- `packages/jay-stack/stack-cli/lib/validate.ts`
- `packages/jay-stack/plugin-validator/lib/validate-plugin.ts`

## Questions

1. **Q: What level of validation is feasible?**
   Loading the component module to inspect its signature is complex and fragile. Should we limit validation to static checks — e.g., if a route has `[slug]` segments but the contract has no `params`, warn? Or if a headless import passes props in jay-html but the contract has no `props` section, warn?

2. **Q: Should validate-plugin check that the contract's props match the component's TypeScript signature?**
   This would require the typescript-bridge or compiler-analyze-exported-types. Is that in scope or a separate effort?

3. **Q: Are there cases where a component has props but intentionally omits them from the contract?**

## Design

Add validation rules to the existing validate commands:

#### In `jay-stack validate` (page validation):

- **Route segments without contract params**: If a page is at a dynamic route (e.g., `products/[slug]/page.jay-html`) and has a `page.jay-contract`, warn if the contract is missing `params` that match the route segments
- **Jay-html prop usage without contract props**: If a `<jay:component>` instance passes attributes that look like props, but the resolved contract has no `props` section, warn

#### In `jay-stack validate-plugin` (plugin validation):

- **Contract props completeness**: If we can load the component's TypeScript types (via the existing type extraction), check that each prop in the signature is declared in the contract. This may be a stretch goal.

## Implementation Plan

### Phase 1: Validate — route-to-contract param consistency

1. In `validate.ts`, add a check: if a page is on a dynamic route and has a page-level contract, ensure the contract declares `params` matching the route's dynamic segments
2. This is the reverse of the existing `checkRouteParams` (which checks contract→route). The new check is route→contract.

### Phase 2: Validate — jay-html prop-to-contract consistency

1. In `validate.ts`, when a `<jay:component>` passes attributes, check that the resolved contract has a `props` section declaring those attributes

### Phase 3 (stretch): validate-plugin type checking

1. Use `compiler-analyze-exported-types` to extract the component's prop types from its TypeScript source
2. Compare against the contract's `props` declarations
3. Warn on mismatches

## Trade-offs

- **Phase 1 is straightforward** — route segment names are already extracted by `checkRouteParams`
- **Phase 2 requires understanding how props are passed** in jay-html to contracts — may need parser support
- **Phase 3 is complex** — requires loading TypeScript, may be slow, should be optional
