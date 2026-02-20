# Contract-Based Tool Descriptions for Gemini Agent

## Background

The gemini-agent plugin auto-generates page automation tools from `AutomationAPI` interactions. Each tool gets a name from the ref name (`toggle-is-selected`, `click-add-to-cart-button`) and a description generated from the ref name:

```
Toggle is selected for a specific item
Click add to cart button
```

These descriptions are poor signals for the LLM. When asked to "select the Claxton's category", the LLM doesn't know that `toggle-is-selected` controls category and price range filters — the description just says "Toggle is selected for a specific item".

Meanwhile, `.jay-contract` files support a `description` field on tags:

```yaml
- tag: isSelected
  type: interactive
  description: Select or deselect a filter (price range or product category)
```

This information is parsed by the contract parser but never reaches the runtime interaction groups.

## Problem

The LLM needs semantic tool descriptions to make good decisions about which tools to use. Current auto-generated descriptions from ref names are meaningless.

Embedding descriptions in the compiled HTML/JS output would increase bundle size for every page, even when no AI agent is present. The cost should only be paid on the AI path.

## Questions and Answers

### Q1: Where do the descriptions live at build time?

The contract parser extracts `description` fields from `.jay-contract` tags into `ContractTag.description`. The agent-kit materializer writes `plugins-index.yaml` with contract paths but no tag-level detail — tag information is in the individual `.jay-contract` files referenced by path.

### Q2: How should descriptions reach the gemini agent at runtime?

**Answer:** Via a server action. The server has access to the materialized contract files. A new action `getToolDescriptions` returns a map of `refName → description` by reading the contract YAML at runtime. The client merges these descriptions into the serialized tools before sending to the server.

This keeps the HTML/JS bundle unchanged — the descriptions are fetched only when the gemini-agent component initializes.

### Q3: Should this be a one-time fetch or per-turn?

**Answer:** One-time. Contract descriptions don't change at runtime. The client fetches them once during the interactive phase init and caches them. The tool definitions sent each turn include the enriched descriptions.

### Q4: What about nested contracts (sub-contracts)?

**Use the leaf tag description only — no concatenation.** Validated against real wix-stores contracts: leaf descriptions are self-contained ("Category checkbox", "Radio button for this range"), and concatenating parents produces redundant or worse results ("Category checkbox in categories", "Button to select this choice in choices in options"). The parent context is already implicit in the coordinate structure the LLM sees (`coordinate: "color/red"`). If a leaf description is insufficient, the author should write a better one.

### Q5: What if a contract tag has no description?

Fall back to the current auto-generated description from the ref name. Descriptions are opt-in — existing contracts work unchanged.

### Q6: Should `plugins-index.yaml` include tag descriptions?

No. Keep `plugins-index.yaml` as a lightweight discovery index. The action reads the full `.jay-contract` files directly. This avoids bloating the index and keeps the single-source-of-truth in the contract files.

## Design

### New action: `getToolDescriptions`

A server action registered by the gemini-agent plugin that reads contract files and returns tool descriptions.

```typescript
interface ToolDescription {
  refName: string;
  description: string;
}

// Returns descriptions for all interactive tags across all contracts
type GetToolDescriptionsOutput = ToolDescription[];
```

The action:

1. Reads `plugins-index.yaml` to find all contract paths
2. Parses each `.jay-contract` YAML
3. Walks the tag tree, collecting `description` fields for interactive tags (leaf description only, no parent concatenation)
4. Returns the list

### Client-side integration

In `gemini-chat.ts`, the interactive phase:

1. Calls `getToolDescriptions` once at init
2. Stores the result as a `Map<string, string>` (refName → description)
3. In `buildSerializedTools`, uses the map to override auto-generated descriptions

```typescript
const description =
  toolDescriptionMap.get(group.refName) ||
  group.description ||
  `${prefix} ${humanName}${isForEach ? ' for a specific item' : ''}`;
```

### Contract authoring

Page authors add descriptions to interactive tags in their contracts:

```yaml
# product-page.jay-contract
tags:
  - tag: filters
    type: sub-contract
    repeated: true
    description: Product filters
    tags:
      - tag: isSelected
        type: interactive
        elementType: HTMLInputElement
        description: Select or deselect this filter
      - tag: filterLabel
        type: data
        dataType: string
```

## Implementation Plan

### Phase 1: Server action

1. Create `getToolDescriptions` action in gemini-agent plugin
2. Read `plugins-index.yaml` for contract paths
3. Parse contracts and extract interactive tag descriptions
4. Handle nested sub-contracts with description concatenation
5. Register as a server action (not exposed to the LLM — internal use only)

### Phase 2: Client integration

1. Call `getToolDescriptions` once during interactive phase init
2. Cache result as a map
3. Use in `buildSerializedTools` to enrich tool descriptions

### Phase 3: Add descriptions to example contracts

1. Add `description` fields to fake-shop contract tags
2. Verify enriched descriptions appear in gemini agent tools

## Trade-offs

| Approach                         | Pro                                                 | Con                                                   |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| **Server action (chosen)**       | Zero bundle cost, descriptions from source of truth | Extra HTTP call at init                               |
| Embed in HTML/JS                 | No init call needed                                 | Increases bundle for all pages, even without AI agent |
| Materializer writes descriptions | Available without parsing contracts                 | Bloats plugins-index.yaml, duplicates source of truth |
