# Contract File Format

Contract files (`.jay-contract`) define the interface between headless components and their UI implementations. They specify the data structure, interactive elements, and component composition using a YAML-based format.

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

**Properties:**

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

**Properties:**

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

**Properties:**

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

**Properties:**

- `type: sub-contract` - Identifies this as a nested contract
- `repeated` - (Optional) Whether this represents an array of items
- `tags` - Nested tag definitions
- `link` - (Alternative to tags) Reference to another contract file

## Linked Contracts

Linked contracts allow you to reference external contract files, enabling component reuse and modular design. Instead of defining nested tags inline, you can link to a separate contract file.

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

### Example: E-commerce Product Structure

```yaml
name: product-page
tags:
  - tag: name
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: number
  - tag: discount
    type: sub-contract
    link: ./discount
  - tag: media
    type: sub-contract
    tags:
      - tag: items
        type: sub-contract
        link: ./media-item
        repeated: true
      - tag: mainMedia
        type: sub-contract
        link: ./media-item
  - tag: addToCart
    type: interactive
    elementType: HTMLButtonElement
```

In this example:

- `discount` links to a reusable discount contract
- `media.items` creates an array of media items using the linked contract
- `media.mainMedia` uses the same contract for a single item

### Best Practices for Linked Contracts

1. **Use descriptive names** for contract files that indicate their purpose
2. **Keep contracts focused** - Each linked contract should represent a single concept
3. **Organize by feature** - Group related contracts in feature-specific directories
4. **Document dependencies** - Make it clear which contracts are required
5. **Version contracts** - Consider versioning for breaking changes

## Recursive Links

Recursive links allow you to create self-referential data structures within a contract, such as trees, nested menus, or hierarchical data. They use the special `$/` syntax to reference parts of the same contract.

### Basic Recursive Link

```yaml
name: folder-tree
tags:
  - tag: name
    type: data
    dataType: string
  - tag: children
    type: sub-contract
    repeated: true
    link: $/
```

The `link: $/` references the root of the current contract, creating a recursive structure.

**Generated TypeScript:**
```typescript
export interface FolderTreeViewState {
  name: string;
  children: Array<FolderTreeViewState>;
}
```

### Nested Path Recursive Links

You can reference nested properties within the contract using path syntax:

```yaml
name: document
tags:
  - tag: title
    type: data
    dataType: string
  - tag: metadata
    type: sub-contract
    tags:
      - tag: category
        type: data
        dataType: string
      - tag: tags
        type: data
        dataType: string
  - tag: relatedDocuments
    type: sub-contract
    repeated: true
    link: $/metadata
```

The `link: $/metadata` references the `metadata` sub-contract within the same contract.

**Generated TypeScript:**
```typescript
export interface MetadataOfDocumentViewState {
  category: string;
  tags: string;
}

export interface DocumentViewState {
  title: string;
  metadata: MetadataOfDocumentViewState;
  relatedDocuments: Array<MetadataOfDocumentViewState>;
}
```

### Array Item Unwrapping with `[]`

When a recursive link points to an array property, you can use the `[]` suffix to unwrap and link to the item type instead of the full array:

```yaml
name: product-list
tags:
  - tag: title
    type: data
    dataType: string
  - tag: products
    type: sub-contract
    repeated: true
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: name
        type: data
        dataType: string
      - tag: price
        type: data
        dataType: number
  - tag: featuredProduct
    type: sub-contract
    link: $/products[]
    description: Links to a single product item (not the array)
```

**Without `[]` - Links to the Array:**
- `link: $/products` → `Array<ProductOfProductListViewState>`

**With `[]` - Links to the Array Item:**
- `link: $/products[]` → `ProductOfProductListViewState | null`

**Generated TypeScript:**
```typescript
export interface ProductOfProductListViewState {
  id: string;
  name: string;
  price: number;
}

export interface ProductListViewState {
  title: string;
  products: Array<ProductOfProductListViewState>;
  featuredProduct: ProductOfProductListViewState | null;
}
```

### Recursive Link Syntax Reference

| Syntax | Resolves To | Generated Type |
|--------|-------------|----------------|
| `$/` | Root contract | `ContractViewState \| null` |
| `$/propertyName` | Nested property | `PropertyType \| null` |
| `$/arrayProperty` | Array property | `Array<ItemType>` |
| `$/arrayProperty[]` | Array item type | `ItemType \| null` |
| `$/nested/path` | Deeply nested property | `PropertyType \| null` |

### Type Nullability Rules

- **Non-array types** get `| null` since they may not exist
- **Array types** don't get `| null` since an empty array (`[]`) can be used
- **Repeated tags** with `repeated: true` always generate arrays

### Common Use Cases

**1. Tree Structures (Direct Recursion)**
```yaml
name: tree-node
tags:
  - tag: value
    type: data
    dataType: string
  - tag: children
    type: sub-contract
    repeated: true
    link: $/
```

**2. Linked Lists (Single Recursion)**
```yaml
name: linked-list
tags:
  - tag: value
    type: data
    dataType: string
  - tag: next
    type: sub-contract
    link: $/
```

**3. Nested Menus (Indirect Recursion)**
```yaml
name: menu
tags:
  - tag: label
    type: data
    dataType: string
  - tag: submenu
    type: sub-contract
    tags:
      - tag: items
        type: sub-contract
        repeated: true
        link: $/
```

**4. Featured Item from Array (Array Unwrapping)**
```yaml
name: catalog
tags:
  - tag: items
    type: sub-contract
    repeated: true
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: title
        type: data
        dataType: string
  - tag: featured
    type: sub-contract
    link: $/items[]
```

### Best Practices for Recursive Links

1. **Use descriptive paths** - Make it clear what you're referencing
2. **Document recursion** - Add descriptions explaining the recursive relationship
3. **Consider depth limits** - Be aware of potential deeply nested structures
4. **Use `[]` for single items** - When referencing one item from an array, use `[]` unwrapping
5. **Validate paths** - Ensure the referenced paths exist in your contract

## Data Types

### Basic Types

| Type      | Example             | Description       |
| --------- | ------------------- | ----------------- |
| `string`  | `dataType: string`  | Text values       |
| `number`  | `dataType: number`  | Numeric values    |
| `boolean` | `dataType: boolean` | True/false values |

### Enum Types

```yaml
dataType: enum (option1 | option2 | option3)
```

Enums define a set of allowed values separated by `|`.

## Examples

### Simple Counter Component

```yaml
name: counter
tags:
  - tag: count
    type: data
    dataType: number
    required: true
  - tag: add
    type: interactive
    elementType: HTMLButtonElement
  - tag: subtract
    type: interactive
    elementType: HTMLButtonElement
```

### Form Component with Nested Structure

```yaml
name: userForm
tags:
  - tag: submitButton
    type: interactive
    elementType: HTMLButtonElement
  - tag: personalInfo
    type: sub-contract
    tags:
      - tag: sectionTitle
        type: data
        dataType: string
      - tag: nameFields
        type: sub-contract
        tags:
          - tag: firstName
            type: [data, interactive]
            dataType: string
            elementType: HTMLInputElement
          - tag: lastName
            type: [data, interactive]
            dataType: string
            elementType: HTMLInputElement
```

### Product Component with External References

```yaml
name: product-page
tags:
  - tag: name
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: number
  - tag: discount
    type: sub-contract
    link: ./discount
  - tag: media
    type: sub-contract
    tags:
      - tag: items
        type: sub-contract
        link: ./media-item
        repeated: true
  - tag: addToCart
    type: interactive
    elementType: HTMLButtonElement
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

1. **Use descriptive names** for tags that clearly indicate their purpose
2. **Add descriptions** to document complex or non-obvious tags
3. **Use enums** for variant tags to ensure type safety
4. **Structure nested contracts** logically to match your component hierarchy
5. **Reference external contracts** for reusable sub-components
6. **Mark required properties** explicitly for better validation
