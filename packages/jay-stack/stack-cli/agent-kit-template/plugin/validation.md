# Plugin Validation

Run `jay-stack validate-plugin` to check your plugin for errors.

## Usage

```bash
# Validate the current plugin
jay-stack validate-plugin

# Validate a specific plugin path
jay-stack validate-plugin --path ./src/plugins/my-plugin

# Verbose output
jay-stack validate-plugin -v
```

## What It Checks

### Contract Validation
- YAML structure is valid
- All required fields are present (`name`, `tags`)
- Tag types are valid (`data`, `variant`, `interactive`, `sub-contract`)
- `dataType` is valid for the tag type
- `trackBy` references an existing data tag with string/number type
- `repeated` sub-contracts have `trackBy`
- Phase constraints are satisfied (children >= parent for arrays)
- No duplicate tag names at the same level
- Props have valid types and unique names

### Plugin Structure
- `plugin.yaml` exists and is valid YAML
- Contract files referenced in `plugin.yaml` exist
- Component export names are valid strings (not file paths)
- Action metadata files (`.jay-action`) exist

### Type Generation
- Contracts compile to valid TypeScript types
- Generated ViewState, Refs, Props, and Params interfaces are correct

## Common Errors

### "trackBy references non-existent tag"
The `trackBy` field must reference a `data` tag within the same sub-contract:

```yaml
# Wrong — trackBy references a tag that doesn't exist
- tag: items
  type: sub-contract
  repeated: true
  trackBy: itemId    # No tag named "itemId"
  tags:
    - tag: id         # Should be "itemId" or trackBy should be "id"
      type: data
      dataType: string
```

### "Child phase earlier than parent"
Array children must have phase >= parent:

```yaml
# Wrong
- tag: items
  type: sub-contract
  repeated: true
  trackBy: id
  phase: fast
  tags:
    - tag: name
      type: data
      phase: slow     # Error: slow < fast
```

### "Interactive tag cannot have explicit phase"
Interactive tags are always `fast+interactive`:

```yaml
# Wrong
- tag: button
  type: interactive
  elementType: HTMLButtonElement
  phase: slow         # Error: remove this line
```

### "Component looks like a path"
The `component` field in `plugin.yaml` should be an export name, not a file path:

```yaml
# Wrong
component: ./lib/components/product-page.ts

# Right
component: productPage
```
