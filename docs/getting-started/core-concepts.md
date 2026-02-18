# Core Concepts

Understanding the fundamental concepts behind Jay will help you build better applications and make the most of the framework's capabilities.

## The Design-to-Code Challenge

Jay was created to solve a fundamental problem in software development: **the gap between design and code**.

### Traditional Workflow Problems

In traditional development workflows:

1. **Designers create mockups** in design tools (Figma, Sketch, etc.)
2. **Developers manually implement** the designs in code
3. **Changes require re-implementation** - designers update designs, developers update code
4. **Inconsistencies emerge** - design and code drift apart over time
5. **Handoff friction** - communication gaps between design and development teams

### Jay's Solution: The Contract

Jay introduces a **contract** between design and code that:

- **Defines the interface** between UI design and component logic
- **Enables automatic updates** when design changes
- **Ensures type safety** across the design-code boundary
- **Supports iterative workflows** without breaking existing code

## Key Architectural Principles

### 1. Contract-First Design

Jay components are built around **contracts** that define:

- **View State**: Data that flows from component logic to UI
- **References**: Named UI elements that component logic can interact with
- **Variants**: Design variations and states

For designers, contracts are expressed as three types of tags in a design tool:

- **Data tags**: Define the information displayed in the UI
- **Interactive tags**: Define elements users can interact with
- **Variant tags**: Define different visual states of the component

```typescript
// The contract defines the interface
interface CounterViewState {
  count: number; // Data to display
}
interface CounterRefs {
  increment: HTMLElementProxy<CounterViewState, HTMLButtonElement>; // Reference to UI element
  decrement: HTMLElementProxy<CounterViewState, HTMLButtonElement>; // Reference to UI element
}
type CounterContract = JayContract<CounterViewState, CounterRefs>;
```

```html
<!-- UI design implements the contract -->
<div>
  <button ref="decrement">-</button>
  <span>{count}</span>
  <button ref="increment">+</button>
</div>
```

### 2. Separation of Concerns

Jay enforces clear separation between:

- **UI Design**: Visual presentation and layout (Jay-HTML files)
- **Component Logic**: Business logic and state management (TypeScript files)
- **Contracts**: Interface definitions (automatically generated)

This separation enables:

- **Design tool integration** - designers can work in their preferred tools
- **Code reusability** - logic can be reused across different UI designs
- **Type safety** - contracts ensure design and code stay in sync

### 3. Reactive by Design

Jay is built on reactive principles:

- **Fine-grained reactivity** - only changed data triggers updates
- **Immutable data** - predictable state management via JSON Patch
- **Automatic dependency tracking** - no manual subscription management
- **Efficient derived collections** - `createDerivedArray` for list mapping without re-creating unchanged items

```typescript
import { createSignal, createMemo, createPatchableSignal, createDerivedArray } from '@jay-framework/component';
import { REPLACE } from '@jay-framework/json-patch';

const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

// Patchable signal for complex nested state
const [user, setUser, patchUser] = createPatchableSignal({ name: '', settings: { theme: 'light' } });
patchUser({ op: REPLACE, path: ['settings', 'theme'], value: 'dark' });

// Derived array: only re-maps items that changed
const rows = createDerivedArray(items, (item) => {
  const { id, name } = item();
  return { id, name, isSelected: id === selectedId() };
});
```

### 4. Zero Trust Security

Jay implements a zero-trust security model:

- **Component isolation** - each component runs in its own context
- **Sandboxed execution** - untrusted code is isolated
- **Secure communication** - controlled interfaces between components
- **3rd party safety** - safe integration of external components

## Component Types

Jay supports different component types for different use cases:

### Headfull Components

**Definition**: Components that include both contract and UI design

**Use Cases**:

- Complete components with specific UI design
- Client-only applications
- Reusable UI components

**Creation**:

```typescript
// Component with embedded UI design
const Counter = makeJayComponent(render, CounterConstructor);
```

### Headless Components

**Definition**: Components that define only the contract without UI

**Use Cases**:

- Reusable logic across different UI designs
- Full-stack applications
- Component libraries

**Creation**:

```typescript
// Logic-only component
const CounterLogic = makeJayStackComponent<CounterContract>().withInteractive((props, refs) => {
  // Component logic here
});
```

## Rendering Phases

Jay Stack supports three rendering phases for optimal performance:

### 1. Slow Rendering (Build Time)

- **When**: Build time or data change time
- **Purpose**: Static data and pre-rendering
- **Output**: Pre-rendered HTML with static data

### 2. Fast Rendering (Server Time)

- **When**: Page serving
- **Purpose**: Dynamic data that can be cached
- **Output**: Server-rendered HTML with dynamic data

### 3. Interactive Rendering (Client Time)

- **When**: User interaction
- **Purpose**: Client-side interactivity
- **Output**: Reactive UI updates

## Data Flow Architecture

### Unidirectional Data Flow

Jay enforces unidirectional data flow:

1. **Component Logic** → **View State** → **UI Rendering**
2. **User Interaction** → **Event Handlers** → **State Updates** → **UI Updates**

### Contract-Based Communication

Components communicate through well-defined contracts:

```html
// Parent component provides data through view state <ChildComponent prop="{childProp}" />
```

```typescript
// Child component receives data through its contract
interface ChildViewState {
  childProp: string; // Data to display
}
interface ChildRefs {
  updateButton: HTMLElementProxy<ChildViewState, HTMLButtonElement>; // Reference to UI element
}
type ChildContract = JayContract<ChildViewState, ChildRefs>;
// Events are handled by registering event listeners on refs in the parent component
// The child component doesn't emit events through jay-html
```

## Type Safety

Jay provides end-to-end type safety:

### Generated Types

- **Automatic type generation** from Jay-HTML files
- **Contract validation** at compile time
- **IntelliSense support** in IDEs

### Type-Safe Events

```typescript
// Type-safe event handling
refs.button.onclick((event) => {
  // event is fully typed
  console.log(event.target.value);
});
```

### Contract Validation

```typescript
// Compile-time validation of contracts
const component = makeJayComponent<CounterContract>(render, constructor);
// TypeScript ensures constructor matches contract
```

## Performance Characteristics

### Compile-Time Optimization

- **Dead code elimination** - unused code is removed
- **Tree shaking** - only used features are included
- **Type-based optimization** - compiler makes decisions based on types

### Runtime Performance

- **Fine-grained updates** - only changed data triggers re-renders
- **Efficient reconciliation** - minimal DOM manipulation
- **Memory efficiency** - automatic cleanup of unused resources

### Security Performance

- **Isolated execution** - components don't interfere with each other
- **Controlled communication** - secure inter-component messaging
- **Resource limits** - prevention of resource exhaustion

## Design Philosophy

### "No Magic" Principle

Jay strives to be as TypeScript-compatible as possible:

- **Explicit APIs** - no hidden behavior
- **TypeScript-first** - full type safety
- **Predictable behavior** - clear cause and effect

### Early Decision Making

Decisions are made as early as possible:

- **Compile-time decisions** - not runtime conditions
- **Type-based optimization** - compiler uses type information
- **Dead code elimination** - unused code is removed

### Immutable Data

Jay assumes data is immutable:

- **Reference equality** - `a === b` means no change
- **Predictable updates** - clear when data changes
- **Performance optimization** - efficient change detection

## Integration Patterns

### Design Tool Integration

Jay integrates with design tools through:

- **Jay-HTML generation** - design tools can generate Jay-HTML
- **Contract extraction** - contracts can be extracted from components
- **Bidirectional workflow** - design ↔ code synchronization

### Build Tool Integration

Jay works with existing build tools:

- **Vite plugin** - seamless Vite integration
- **Rollup plugin** - Rollup bundling support
- **CLI tools** - command-line utilities

### Framework Integration

Jay can integrate with other frameworks:

- **React integration** - use Jay components in React
- **Plugin system** - reusable component packages
- **3rd party components** - safe integration of external code

## Next Steps

Now that you understand the core concepts:

1. **Try the Quick Start Guide** - Build your first component
2. **Explore Jay-HTML Format** - Learn the extended HTML syntax
3. **Study Contract Files** - Understand component interfaces
4. **Build Components** - Apply these concepts in practice

---

Ready to dive deeper? Explore the [Jay-HTML Format](../core/jay-html.md) to learn how to create design contracts!
