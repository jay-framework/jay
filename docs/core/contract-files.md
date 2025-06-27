# Contract Files

Contract files (`.jay-contract`) define reusable component interfaces using a YAML-based format. They enable you to create headless components that can be used across different UI designs.

## Overview

Contract files serve as the interface definition between component logic and UI implementations. They define:

- **View State** - Data that flows from component logic to UI
- **References** - Named UI elements for interaction
- **Variants** - Design variations and states
- **Nested Contracts** - Component composition and reuse

## Basic Structure

A contract file consists of a `name` and a list of `tags`:

```yaml
name: component-name
tags:
  - tag: tagName
    type: tagType
    # additional properties based on type
```

## Tag Types

### Data Tags

Data tags define the component's view state properties.

```yaml
- tag: count
  type: data
  dataType: number
  required: true
  description: The current count value
```

**Properties**:
- `type: data` - Identifies this as a data property
- `dataType` - The data type (string, number, boolean, enum)
- `required` - (Optional) Whether this property is required
- `description` - (Optional) Documentation for the property

### Interactive Tags

Interactive tags define elements that can be interacted with programmatically.

```yaml
- tag: submitButton
  type: interactive
  elementType: HTMLButtonElement
  description: Button to submit the form
```

**Properties**:
- `type: interactive` - Identifies this as an interactive element
- `elementType` - The HTML element type (required)
- `description` - (Optional) Documentation for the element

### Variant Tags

Variant tags define design variations or states.

```yaml
- tag: status
  type: variant
  dataType: enum (active | inactive | pending)
  description: The current status of the component
```

**Properties**:
- `type: variant` - Identifies this as a variant
- `dataType` - Must be an enum type (required)
- `description` - (Optional) Documentation for the variant

### Sub-Contract Tags

Sub-contract tags define nested component structures.

```yaml
- tag: items
  type: sub-contract
  repeated: true
  tags:
    - tag: title
      type: data
      dataType: string
    - tag: completed
      type: data
      dataType: boolean
```

**Properties**:
- `type: sub-contract` - Identifies this as a nested contract
- `repeated` - (Optional) Whether this represents an array of items
- `tags` - Nested tag definitions
- `link` - (Alternative to tags) Reference to another contract file

## Data Types

### Basic Types

| Type | Example | Description |
|------|---------|-------------|
| `string` | `dataType: string` | Text values |
| `number` | `dataType: number` | Numeric values |
| `boolean` | `dataType: boolean` | True/false values |

### Enum Types

```yaml
dataType: enum (option1 | option2 | option3)
```

Enums define a set of allowed values separated by `|`.

### Complex Types

You can combine multiple types for tags that serve multiple purposes:

```yaml
- tag: email
  type: [data, interactive]
  dataType: string
  elementType: HTMLInputElement
```

## Linked Contracts

Linked contracts allow you to reference external contract files, enabling component reuse and modular design.

### Basic Linked Contract

```yaml
- tag: discount
  type: sub-contract
  link: ./discount
```

This references a `discount.jay-contract` file in the same directory.

### Linked Contract with Repeated Items

```yaml
- tag: media
  type: sub-contract
  tags:
    - tag: items
      type: sub-contract
      link: ./media-item
      repeated: true
```

This creates an array of items, each following the structure defined in `media-item.jay-contract`.

### Benefits of Linked Contracts

1. **Reusability** - Define a contract once and use it across multiple components
2. **Maintainability** - Changes to the linked contract automatically apply everywhere
3. **Modularity** - Break complex components into smaller, focused contracts
4. **Consistency** - Ensure consistent structure across related components

### File Resolution

- **Relative paths** - `./component` or `../components/button`
- **Module imports** - `<npm-module-name>/<path-to-contract>`
- **File extension** - The `.jay-contract` extension is automatically appended
- **Directory structure** - Contracts can be organized in subdirectories

## Examples

### Simple Counter Component

```yaml
name: counter
tags:
  - tag: count
    type: data
    dataType: number
    required: true
    description: The current count value
  - tag: add
    type: interactive
    elementType: HTMLButtonElement
    description: Button to increment the counter
  - tag: subtract
    type: interactive
    elementType: HTMLButtonElement
    description: Button to decrement the counter
```

### Form Component with Nested Structure

```yaml
name: userForm
tags:
  - tag: submitButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to submit the form
  - tag: personalInfo
    type: sub-contract
    tags:
      - tag: sectionTitle
        type: data
        dataType: string
        description: Title for the personal info section
      - tag: nameFields
        type: sub-contract
        tags:
          - tag: firstName
            type: [data, interactive]
            dataType: string
            elementType: HTMLInputElement
            description: First name input field
          - tag: lastName
            type: [data, interactive]
            dataType: string
            elementType: HTMLInputElement
            description: Last name input field
```

### Product Component with External References

```yaml
name: product-page
tags:
  - tag: name
    type: data
    dataType: string
    description: Product name
  - tag: price
    type: data
    dataType: number
    description: Product price
  - tag: discount
    type: sub-contract
    link: ./discount
    description: Discount information
  - tag: media
    type: sub-contract
    tags:
      - tag: items
        type: sub-contract
        link: ./media-item
        repeated: true
        description: Product media items
      - tag: mainMedia
        type: sub-contract
        link: ./media-item
        description: Main product image
  - tag: addToCart
    type: interactive
    elementType: HTMLButtonElement
    description: Add to cart button
```

## Validation Rules

### Required Properties

- **Variant tags** must have a `dataType` (enum)
- **Interactive tags** must have an `elementType`
- **Sub-contract tags** must have either `tags` or `link`

### Type Restrictions

- **Sub-contract tags** cannot be combined with other types
- **Sub-contract tags** cannot have `dataType` or `elementType`
- **Unknown tag types** will cause validation errors

### Defaults

- If `type` is not specified, defaults to `data`
- If `dataType` is not specified for data tags, defaults to `string`

## Best Practices

### 1. Use Descriptive Names

Choose clear, descriptive names for your contracts and tags:

```yaml
# Good
name: user-profile-card
tags:
  - tag: userName
    type: data
    dataType: string
  - tag: profileImage
    type: data
    dataType: string

# Avoid
name: card
tags:
  - tag: name
    type: data
    dataType: string
  - tag: img
    type: data
    dataType: string
```

### 2. Add Descriptions

Document complex or non-obvious tags:

```yaml
- tag: status
  type: variant
  dataType: enum (draft | published | archived)
  description: The publication status of the content
  required: true
```

### 3. Use Enums for Variants

Use enums to ensure type safety for variant tags:

```yaml
- tag: theme
  type: variant
  dataType: enum (light | dark | auto)
  description: The current theme setting
```

### 4. Structure Nested Contracts Logically

Organize nested contracts to match your component hierarchy:

```yaml
- tag: form
  type: sub-contract
  tags:
    - tag: fields
      type: sub-contract
      tags:
        - tag: email
          type: [data, interactive]
          dataType: string
          elementType: HTMLInputElement
        - tag: password
          type: [data, interactive]
          dataType: string
          elementType: HTMLInputElement
    - tag: submit
      type: interactive
      elementType: HTMLButtonElement
```

### 5. Reference External Contracts for Reusability

Use linked contracts for reusable sub-components:

```yaml
- tag: discount
  type: sub-contract
  link: ./discount
  description: Reusable discount component
```

### 6. Organize by Feature

Group related contracts in feature-specific directories:

```
contracts/
├── user/
│   ├── user-profile.jay-contract
│   ├── user-settings.jay-contract
│   └── user-avatar.jay-contract
├── product/
│   ├── product-card.jay-contract
│   ├── product-details.jay-contract
│   └── product-gallery.jay-contract
└── common/
    ├── button.jay-contract
    ├── input.jay-contract
    └── modal.jay-contract
```

## Type Generation

Jay automatically generates TypeScript types from contract files:

```typescript
// Generated from counter.jay-contract
export interface CounterContract {
  count: number;
  add: HTMLButtonElement;
  subtract: HTMLButtonElement;
}

// Generated from user-form.jay-contract
export interface UserFormContract {
  submitButton: HTMLButtonElement;
  personalInfo: {
    sectionTitle: string;
    nameFields: {
      firstName: string & HTMLInputElement;
      lastName: string & HTMLInputElement;
    };
  };
}
```

## Integration with Jay-HTML

Contract files can be imported into Jay-HTML files:

```html
<html>
  <head>
    <script
      type="application/jay-headless"
      contract="./counter.jay-contract"
      src="./counter"
      name="counter"
      key="counter"
    ></script>
    <script type="application/jay-data">
      data:
        pageTitle: string
    </script>
  </head>
  <body>
    <div>
      <h1>{pageTitle}</h1>
      <div>
        <span>Count: {counter.count}</span>
        <button ref="counter.add">+</button>
        <button ref="counter.subtract">-</button>
      </div>
    </div>
  </body>
</html>
```

## Common Patterns

### Form Contracts

```yaml
name: form
tags:
  - tag: fields
    type: sub-contract
    tags:
      - tag: email
        type: [data, interactive]
        dataType: string
        elementType: HTMLInputElement
      - tag: password
        type: [data, interactive]
        dataType: string
        elementType: HTMLInputElement
  - tag: submit
    type: interactive
    elementType: HTMLButtonElement
  - tag: errors
    type: data
    dataType: string
```

### List Item Contracts

```yaml
name: list-item
tags:
  - tag: title
    type: data
    dataType: string
  - tag: description
    type: data
    dataType: string
  - tag: status
    type: variant
    dataType: enum (active | inactive | pending)
  - tag: actions
    type: sub-contract
    tags:
      - tag: edit
        type: interactive
        elementType: HTMLButtonElement
      - tag: delete
        type: interactive
        elementType: HTMLButtonElement
```

### Modal Contracts

```yaml
name: modal
tags:
  - tag: isOpen
    type: data
    dataType: boolean
  - tag: title
    type: data
    dataType: string
  - tag: content
    type: data
    dataType: string
  - tag: close
    type: interactive
    elementType: HTMLButtonElement
  - tag: confirm
    type: interactive
    elementType: HTMLButtonElement
```

## Next Steps

Now that you understand contract files:

1. **Build Components** - Create headless components that implement contracts
2. **Learn Jay Stack** - Use contracts in full-stack applications
3. **Explore Examples** - See real-world contract patterns
4. **Master State Management** - Learn reactive state management

---

Ready to build your first headless component? Check out the [Component Development](./components.md) guide! 