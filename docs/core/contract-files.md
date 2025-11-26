# Contract Files

Contract files (`.jay-contract`) define the interface between design tools and component implementations using a YAML-based format. Contracts are a core principle of Jay, enabling collaborative workflows between designers and developers where each can work independently, interacting only through the contract definitions.

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
  phase: fast+interactive
```

**Properties**:

- `type: data` - Identifies this as a data property
- `dataType` - The data type (string, number, boolean, enum)
- `required` - (Optional) Whether this property is required
- `description` - (Optional) Documentation for the property
- `phase` - (Optional) The rendering phase for this property (see [Rendering Phases](#rendering-phases))

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
- `elementType` - The HTML element type or a headfull Jay component type (required)
  Interactive tags can have multiple types set as an array, which means the designer must choose one of those types.
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
- `dataType` - Can be an enum or boolean type (required)
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

### Multi-Typed Tags

Jay Contract allows a tag to be of one or more of the `data`, `interactive`, and `variant` types. Such tag types are defined as an array of tag types. `sub-contract` tags cannot have additional tag types.

```yaml
- tag: title
  type: [data, interactive]
  dataType: string
  elementType: HTMLInputElement
```

### Tag Metadata

Any tag can have additional metadata to be used by design tools. The supported metadata includes:

- `description` - A textual description of the tag. For multi-typed tags, this can be an array providing different descriptions for each usage of the tag as different types.
- `required` - Whether the tag is required. This tells a design tool to give feedback to the designer if this tag is not used. For instance, a checkout button may be required in e-commerce product pages.
- `repeated` - Whether this tag is a repeated data entity, or an array when transformed to coding types.
- `async` - Whether this tag represents asynchronous data (promises). Available for `data` and `sub-contract` tags.
- `phase` - The rendering phase for this property (slow, fast, or fast+interactive). See [Rendering Phases](#rendering-phases) for details.

## Rendering Phases

Rendering phases allow you to specify when each property in your contract is rendered, enabling optimal performance in full-stack applications. This feature is especially powerful with Jay Stack components, which support three-phase rendering.

### Phase Types

| Phase              | When Set           | Mutability | Use Case                          |
| ------------------ | ------------------ | ---------- | --------------------------------- |
| `slow`             | Build time         | Static     | Content that rarely changes       |
| `fast`             | Request time       | Dynamic    | Per-request data (no client mods) |
| `fast+interactive` | Request/Client     | Dynamic    | Client-modifiable data            |

### Phase Semantics

#### Slow Phase (Build Time)

Properties marked as `slow` are rendered at **build time** or when static data changes. These values are baked into the HTML and don't change per request.

**Use Cases:**
- Product names and descriptions
- Blog post content
- Static images and assets
- SEO metadata

**Example:**
```yaml
- tag: productName
  type: data
  dataType: string
  phase: slow
  description: Static product name
```

#### Fast Phase (Request Time)

Properties marked as `fast` are rendered at **request time** on the server. These values can change per request but are not modifiable on the client.

**Use Cases:**
- Inventory status
- Current prices
- User-specific content (names, avatars)
- Dynamic recommendations

**Example:**
```yaml
- tag: inStock
  type: data
  dataType: boolean
  phase: fast
  description: Current inventory status
```

#### Fast+Interactive Phase (Request Time + Client)

Properties marked as `fast+interactive` are initially rendered at **request time** but can be **modified on the client**. These properties appear in both `FastViewState` and `InteractiveViewState`.

**Use Cases:**
- Shopping cart quantity
- Form input values
- UI toggles and selections
- Client-side counters

**Example:**
```yaml
- tag: quantity
  type: data
  dataType: number
  phase: fast+interactive
  description: Product quantity (modifiable on client)
```

### Default Phases

If no `phase` is specified:

**For `.jay-contract` files:**
- **Data tags** default to `slow` (static)
- **Interactive tags** are implicitly `fast+interactive` (cannot specify phase)

**For inline data in `.jay-html` files:**
- All properties default to `fast+interactive` (interactive phase)

### Phase Rules and Validation

#### Rule 1: Interactive Tags Have Implicit Phase

Interactive tags (refs) are **implicitly `fast+interactive`** and cannot have an explicit `phase` attribute:

```yaml
# ✅ Correct: No phase on interactive tag
interactive:
  - tag: addButton
    elementType: [button]

# ❌ Invalid: Cannot specify phase on interactive tag
interactive:
  - tag: addButton
    elementType: [button]
    phase: fast+interactive  # Error!
```

#### Rule 2: Object Phase as Default

For nested objects, the `phase` attribute acts as a **default** for child properties. It has no semantic meaning for the object itself:

```yaml
- tag: pricing
  type: sub-contract
  phase: slow  # Default for children
  tags:
    - tag: basePrice
      type: data
      dataType: number
      # Inherits 'slow' from parent
    
    - tag: currentPrice
      type: data
      dataType: number
      phase: fast  # Overrides parent default
```

#### Rule 3: Array Phase Hierarchy

For arrays, the `phase` indicates when the **array structure is set**. Child properties can have a later phase than the array, but not an earlier one:

```yaml
# ✅ Valid: Array is slow, children can be fast or interactive
- tag: products
  type: sub-contract
  repeated: true
  phase: slow  # Array structure is static
  tags:
    - tag: name
      type: data
      dataType: string
      phase: slow
    
    - tag: price
      type: data
      dataType: number
      phase: fast  # OK: fast >= slow

# ❌ Invalid: Child has earlier phase than parent array
- tag: products
  type: sub-contract
  repeated: true
  phase: fast  # Array structure is dynamic
  tags:
    - tag: sku
      type: data
      dataType: string
      phase: slow  # Error: slow < fast
```

**Rule:** `child.phase >= parent.phase`

### Generated Types

When you use rendering phases, the compiler generates phase-specific ViewState types:

```yaml
name: ProductPage
tags:
  - tag: name
    type: data
    dataType: string
    phase: slow
  
  - tag: price
    type: data
    dataType: number
    phase: fast
  
  - tag: quantity
    type: data
    dataType: number
    phase: fast+interactive
```

**Generated TypeScript:**
```typescript
// Full ViewState (all properties)
export interface ProductPageViewState {
  name: string;
  price: number;
  quantity: number;
}

// Slow ViewState (build-time properties only)
export type ProductPageSlowViewState = Pick<ProductPageViewState, 'name'>;

// Fast ViewState (request-time properties)
export type ProductPageFastViewState = Pick<ProductPageViewState, 'price' | 'quantity'>;

// Interactive ViewState (client-modifiable properties)
export type ProductPageInteractiveViewState = Pick<ProductPageViewState, 'quantity'>;

// 5-parameter contract with phase types
export type ProductPageContract = JayContract<
  ProductPageViewState,
  ProductPageRefs,
  ProductPageSlowViewState,
  ProductPageFastViewState,
  ProductPageInteractiveViewState
>;
```

### Using Phases with Jay Stack

Rendering phases enable type-safe full-stack components with Jay Stack:

```typescript
import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';
import { ProductPageContract } from './product-page.jay-contract';

export const page = makeJayStackComponent<ProductPageContract>()
  .withProps<Props>()
  
  // Slow render: Only 'name' is valid (SlowViewState)
  .withSlowlyRender(async (props) => {
    return partialRender(
      { name: 'Product' },
      { productId: '123' }
    );
  })
  
  // Fast render: 'price' and 'quantity' are valid (FastViewState)
  .withFastRender(async (props) => {
    return partialRender(
      { price: 99.99, quantity: 1 },
      {}
    );
  })
  
  // Interactive: Only 'quantity' is modifiable (InteractiveViewState)
  .withInteractive((props, refs) => {
    const [qty, setQty] = createSignal(props.quantity);
    
    return {
      render: () => ({ quantity: qty() })
    };
  });
```

**Type Safety:**
- ✅ TypeScript validates each phase returns only allowed properties
- ✅ IDE autocomplete shows only valid properties for each phase
- ✅ Refactoring in contract propagates to all usage

### Contract References in Jay HTML

You can reference contracts from `.jay-html` files to get phase-aware type validation:

**`product.jay-contract`:**
```yaml
name: Product
tags:
  - tag: name
    type: data
    dataType: string
    phase: slow
  - tag: price
    type: data
    dataType: number
    phase: fast
```

**`product.jay-html`:**
```html
<html>
  <head>
    <script type="application/jay-data" contract="./product.jay-contract"></script>
  </head>
  <body>
    <h1>{name}</h1>
    <p>${price}</p>
  </body>
</html>
```

The generated types will include phase-specific ViewStates, enabling compile-time validation.

### Best Practices

#### 1. Start with Defaults

Begin without phase annotations and add them only when you need to optimize:

```yaml
# Start simple (everything defaults to slow)
- tag: title
  type: data
  dataType: string

# Add phases as you optimize
- tag: title
  type: data
  dataType: string
  phase: slow  # Explicit for documentation
```

#### 2. Use Slow for Static Content

Mark truly static content as `slow` to enable build-time optimization:

```yaml
# Static content
- tag: productDescription
  type: data
  dataType: string
  phase: slow

# Dynamic content
- tag: inventory
  type: data
  dataType: number
  phase: fast
```

#### 3. Mark Client-Modifiable Data

Use `fast+interactive` for data that users can change:

```yaml
# Read-only
- tag: productId
  type: data
  dataType: string
  phase: fast

# Client-modifiable
- tag: selectedQuantity
  type: data
  dataType: number
  phase: fast+interactive
```

#### 4. Document Phase Decisions

Use descriptions to explain why a particular phase was chosen:

```yaml
- tag: recommendedProducts
  type: sub-contract
  repeated: true
  phase: fast
  description: Personalized recommendations (generated per request)
  link: ./product-card
```

#### 5. Group by Phase

Organize contract tags by phase for better readability:

```yaml
name: ProductPage
tags:
  # Slow phase (build time)
  - tag: sku
    type: data
    dataType: string
    phase: slow
  - tag: name
    type: data
    dataType: string
    phase: slow
  
  # Fast phase (request time)
  - tag: price
    type: data
    dataType: number
    phase: fast
  - tag: inStock
    type: data
    dataType: boolean
    phase: fast
  
  # Interactive phase
  - tag: quantity
    type: data
    dataType: number
    phase: fast+interactive
```

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

## Async Tags

Async tags represent asynchronous data such as API responses, promises, or other async operations. They are useful for modeling data that needs to be loaded asynchronously in the UI.

### Async Data Tags

```yaml
- tag: userProfile
  type: data
  async: true
  dataType: string
  description: User profile data loaded from API

- tag: status
  type: data
  async: true
  dataType: enum (active | inactive | pending)
  description: Async status that updates from server
```

### Async Sub-Contract Tags

```yaml
- tag: userDetails
  type: sub-contract
  async: true
  description: User details loaded asynchronously
  tags:
    - tag: name
      type: data
      dataType: string
    - tag: email
      type: data
      dataType: string
    - tag: avatar
      type: data
      dataType: string

- tag: notifications
  type: sub-contract
  async: true
  repeated: true
  description: List of notifications loaded from server
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: message
      type: data
      dataType: string
    - tag: timestamp
      type: data
      dataType: string
```

### Async with Linked Contracts

```yaml
- tag: productData
  type: sub-contract
  async: true
  link: ./product-details
  description: Product information loaded asynchronously

- tag: reviews
  type: sub-contract
  async: true
  repeated: true
  link: ./review-item
  description: Product reviews loaded from API
```

### Generated Types for Async Tags

Async tags generate TypeScript `Promise<T>` types:

```typescript
// Generated from async contract
export interface UserDashboardViewState {
  userProfile: Promise<string>;
  userDetails: Promise<{
    name: string;
    email: string;
    avatar: string;
  }>;
  notifications: Promise<
    Array<{
      id: string;
      message: string;
      timestamp: string;
    }>
  >;
}
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

Jay automatically generates TypeScript types from contract files. The generated types include:

1. **ViewState interfaces** - For data and interactive elements
2. **Ref interfaces** - For interactive elements with proper HTML element types
3. **Enum types** - For variant definitions
4. **Contract types** - For the complete component contract

```typescript
// Generated from counter.jay-contract
export enum IsPositive {
  positive,
  negative,
}

export interface CounterViewState {
  count: number;
  isPositive: IsPositive;
}

export interface CounterRefs {
  add: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
  subtract: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterContract = JayContract<CounterViewState, CounterRefs>;
```

For repeated elements (arrays), collection proxies are generated:

```typescript
// Generated from todo-list.jay-contract
export interface TodoItemViewState {
    title: string;
    completed: boolean;
}

export interface TodoListViewState {
    items: Array<TodoItemViewState>;
    filter: enum (all | active | completed);
}

export interface TodoListRefs {
    addButton: HTMLElementProxy<TodoListViewState, HTMLButtonElement>;
    items: {
        title: HTMLElementCollectionProxy<TodoItemViewState, HTMLInputElement>;
        completed: HTMLElementCollectionProxy<TodoItemViewState, HTMLInputElement>;
    };
}
```

## Next Steps

Now that you understand contract files:

1. **Build Components** - Create headless components that implement contracts
2. **Learn Jay Stack** - Use contracts in full-stack applications
3. **Explore Examples** - See real-world contract patterns
4. **Master State Management** - Learn reactive state management

---

Ready to build your first headless component? Check out the [Component Development](./components.md) guide!
