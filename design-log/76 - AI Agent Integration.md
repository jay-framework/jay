# AI Agent Integration for Jay Components

## Background

Jay components have a clear separation between UI (jay-html) and logic (TypeScript). The UI is driven by ViewState, and user interactions are handled through refs and events. This structured approach makes Jay ideal for AI agent automation:

1. **ViewState** contains all data displayed on the page
2. **Refs** define interactive elements (buttons, inputs, etc.)
3. **Coordinates** identify elements in collections (forEach items)
4. **Events** are triggered with `{event, viewState, coordinate}`

This design log proposes exposing the page state and interactions to AI agents, enabling them to:

- Read current page content (derived from ViewState)
- Discover all possible interactions
- Trigger events, including those on forEach items (e.g., remove from cart)

## Problem Statement

### Current Situation

Jay components are designed for human interaction via DOM events. There's no programmatic API for:

1. Querying the current ViewState
2. Listing available interactions
3. Triggering events from external code (like an AI agent)

### Desired Behavior

```typescript
// AI agent can query page state and interactions
const pageInfo = window.__JAY_AGENT__.getPageState();
// → { viewState: {...}, interactions: [...] }

// AI can trigger events
window.__JAY_AGENT__.triggerEvent('click', ['prod-123', 'remove-btn']);
// → Triggers click on remove button for product prod-123
```

### Use Cases

1. **AI Test Automation**: Agent navigates the app, fills forms, validates states
2. **AI Assistant**: Understands page context to help users
3. **Accessibility**: Alternative interaction methods for assistive tech
4. **E2E Testing**: Programmatic interaction without DOM selectors

## Questions & Answers

### Q1: What data should be exposed in the page state?

**A:** Three levels of information:

1. **ViewState**: The current data driving the UI (product names, prices, cart items)
2. **Interactions**: Available actions with their coordinates and event types
3. **DOM Elements**: Reference to actual DOM elements with their coordinates (for setting values)

```typescript
interface AIPageState {
  viewState: object; // The current ViewState
  interactions: AIInteraction[];
}

interface AIInteraction {
  refName: string; // e.g., "remove-btn"
  coordinate: string[]; // e.g., ["prod-123", "remove-btn"]
  element: Element; // The actual DOM element
  elementType: string; // e.g., "HTMLButtonElement"
  supportedEvents: string[]; // e.g., ["click", "focus"]
  itemContext?: object; // ViewState of the forEach item (if applicable)
}
```

The `element` reference allows the AI to:
- Read current input values directly from DOM
- Set input values before triggering events (e.g., set text, then trigger `input` event)
- Inspect element attributes and state

### Q2: How do we handle forEach items?

**A:** Each item in a collection has a coordinate path. For nested collections:

```html
<ul>
  <li forEach="cartItems" trackBy="productId">
    <span>{productName}</span>
    <button ref="remove">Remove</button>
  </li>
</ul>
```

The interactions would be:

```javascript
[
  { refName: "remove", coordinate: ["prod-123", "remove"], itemContext: { productId: "prod-123", ... } },
  { refName: "remove", coordinate: ["prod-456", "remove"], itemContext: { productId: "prod-456", ... } },
]
```

### Q3: How do we keep the runtime package small?

**A:**

**Option A: Separate package** (Recommended)

- Create `@jay-framework/runtime-ai` package
- Only imported when AI features are needed
- Zero cost when not used

**Option B: Conditional import via entry point**

- `@jay-framework/runtime/ai` separate entry
- Tree-shakeable if not imported

**Option C: Runtime flag**

- `enableAIAgent()` function that adds capability
- Still requires bundling the code

**Recommendation**: Option A (separate package) for complete isolation.

### Q4: How does the AI trigger events?

**A:** The AI needs to:

1. Find the correct element by coordinate
2. Dispatch the appropriate event
3. Handle the result (state change, navigation, etc.)

```typescript
interface AIAgentAPI {
  getPageState(): AIPageState;
  triggerEvent(eventType: string, coordinate: string[], eventData?: object): Promise<void>;
  waitForStateChange(): Promise<AIPageState>;
}
```

### Q5: How do we integrate with the component lifecycle?

**A:** The AI agent attaches to the component instance during initialization (no global singleton):

**Jay (basic) usage:**

```typescript
import { wrapWithAIAgent } from '@jay-framework/runtime-ai';

const target = document.getElementById('target');
const [refs, render2] = render();
const instance = render2({ todoProps: { initialTodos } });

// Wrap the instance with AI agent capabilities
const aiInstance = wrapWithAIAgent(instance);
// aiInstance has both the original API and AI methods

target.appendChild(aiInstance.dom);

// Use AI API directly on the instance
const state = aiInstance.ai.getPageState();
aiInstance.ai.onStateChange((newState) => { /* ... */ });
```

**Jay Stack usage:**

```typescript
import { wrapWithAIAgent } from '@jay-framework/runtime-ai';

const target = document.getElementById('target');
const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap);
const instance = pageComp({ ...viewState, ...fastCarryForward });

// Wrap with AI agent (e.g., in dev mode only)
const aiInstance = process.env.DEV 
  ? wrapWithAIAgent(instance)
  : instance;

target.appendChild(aiInstance.element.dom);
```

**Key points:**
- No `window.__JAY_AGENT__` global
- AI API is a property on the wrapped instance
- Clean separation - original component unchanged
- Can be conditionally applied (dev mode only)

### Q6: Security considerations?

**A:**

1. **Dev only by default**: AI agent API should be disabled in production
2. **No sensitive data**: ViewState should not contain secrets
3. **Rate limiting**: Prevent event flooding
4. **Sandboxing**: AI actions should respect existing security boundaries

### Q7: How to handle async events and state changes?

**A:** Use event-based notification. A single DOM event can trigger multiple ViewState updates (e.g., optimistic update, then server response). The AI should subscribe to state changes:

```typescript
// Subscribe to state changes
const unsubscribe = ai.onStateChange((newState) => {
  console.log('State updated:', newState.viewState);
});

// Trigger event - state changes arrive via callback
ai.triggerEvent('click', ['checkout-btn']);

// Later: unsubscribe when done
unsubscribe();
```

This is better than `waitForStateChange()` because:
- Multiple updates are captured (not just the first)
- No timeout guessing required
- Aligns with reactive nature of Jay components

### Q8: How do we expose input element values and state?

**A:** No special structure needed. ViewState already has a field for each form input value. The AI reads values from ViewState and sets values directly on DOM elements (via the `element` reference in interactions) before triggering events:

```typescript
// ViewState already contains form values
interface CheckoutViewState {
  customerName: string;    // Bound to <input ref="name" value="{customerName}">
  email: string;           // Bound to <input ref="email" value="{email}">
}

// AI reads current values from ViewState
const state = ai.getPageState();
console.log(state.viewState.customerName); // "John"

// AI sets value on DOM element, then triggers event
const nameInteraction = state.interactions.find(i => i.refName === 'name');
(nameInteraction.element as HTMLInputElement).value = 'Jane';
ai.triggerEvent('input', ['name']);
```

**Optional**: Metadata mapping ViewState fields to DOM elements could be added later if needed.

### Q9: How do we identify the component/page for multi-component pages?

**A:** Scoping is already built-in via the headless component key field in ViewState and Refs. Each headless component's data is nested under its key:

```typescript
// ViewState with headless components
interface PageViewState {
  pageTitle: string;
  cart: {              // Headless component key
    items: CartItem[];
    total: number;
  };
  header: {            // Another headless component
    userName: string;
  };
}

// Refs follow the same structure
interface PageRefs {
  checkout: HTMLButtonElement;       // Page-level ref
  cart: {                            // Headless component refs
    removeBtn: HTMLButtonElement[];  // Collection within cart
  };
}
```

The AI agent works with this naturally - coordinates include the component path:
- `['checkout']` - page-level button
- `['cart', 'prod-123', 'removeBtn']` - remove button in cart for product prod-123

### Q10: How do we handle secure sandbox (worker-based) components?

**A:** For secure components (running in worker), the AI API runs in the main thread and communicates via the existing message channel. The coordinator can expose a compatible API:

```typescript
// In secure mode, the coordinator exposes the AI API
// The viewState is sent via message to main thread
// Events are sent back to worker via existing JPMDomEvent
```

## Design

### Architecture

```mermaid
graph TB
    AI[AI Agent] --> API[AIAgentAPI]
    API --> RS[RuntimeState]
    API --> ET[EventTrigger]

    RS --> VS[ViewState]
    RS --> Refs[Refs Registry]

    ET --> EM[Event Manager]
    EM --> Comp[Component]

    subgraph "@jay-framework/runtime-ai"
        API
        RS
        ET
    end

    subgraph "@jay-framework/runtime"
        VS
        Refs
        EM
        Comp
    end
```

### Package Structure

```
packages/runtime/
├── runtime-ai/           # NEW: AI Agent package
│   ├── lib/
│   │   ├── index.ts
│   │   ├── ai-agent-api.ts
│   │   ├── state-reader.ts
│   │   ├── interaction-collector.ts
│   │   └── event-trigger.ts
│   ├── package.json
│   └── vite.config.ts
└── runtime/              # Existing: no changes needed initially
    └── lib/
        ├── index.ts
        └── ... (exports hooks for AI integration)
```

### Core Types

```typescript
// packages/runtime-ai/lib/types.ts

export type Coordinate = string[];

export interface AIInteraction {
  /** Ref name from jay-html */
  refName: string;

  /** Full coordinate path (for forEach items) */
  coordinate: Coordinate;

  /** The actual DOM element - can be used to read/set values */
  element: Element;

  /** HTML element type (e.g., "HTMLButtonElement") */
  elementType: string;

  /** Events this element can handle (e.g., ["click", "input"]) */
  supportedEvents: string[];

  /** For collection items: the item's ViewState */
  itemContext?: object;

  /** Human-readable description (from contract if available) */
  description?: string;
}

export interface AIPageState {
  /** Current ViewState of the component (includes headless component data under their keys) */
  viewState: object;

  /** All available interactions with their DOM elements */
  interactions: AIInteraction[];
}

export interface AIAgentAPI {
  /** Get current page state and available interactions */
  getPageState(): AIPageState;

  /** Trigger an event on an element by coordinate */
  triggerEvent(eventType: string, coordinate: Coordinate, eventData?: object): void;

  /** Subscribe to state changes - called on every ViewState update */
  onStateChange(callback: (state: AIPageState) => void): () => void;

  /** Get a specific interaction by coordinate */
  getInteraction(coordinate: Coordinate): AIInteraction | undefined;
}
```

**Note:** 
- No `setValue` method - AI sets values directly on `interaction.element`
- No `waitForStateChange` - use event-based `onStateChange` instead
- No component ID params - scoping is built into ViewState structure via headless keys
- `triggerEvent` is synchronous - state changes arrive via `onStateChange` callback
```

### Implementation

#### 1. State Reader

```typescript
// packages/runtime-ai/lib/state-reader.ts

import type { JayComponent } from '@jay-framework/runtime';

export function readViewState(component: JayComponent<any, any, any>): object {
  // Access the component's current ViewState
  // This needs a hook in the runtime to expose ViewState
  return component.__viewState ?? {};
}
```

#### 2. Interaction Collector

```typescript
// packages/runtime-ai/lib/interaction-collector.ts

import type { ManagedRefs, Coordinate } from '@jay-framework/runtime';
import type { AIInteraction } from './types';

export function collectInteractions(refs: ManagedRefs): AIInteraction[] {
  const interactions: AIInteraction[] = [];

  // Iterate through all refs in the component
  for (const [refName, refImpl] of Object.entries(refs)) {
    if (refImpl.elements) {
      // Collection ref (forEach)
      for (const elem of refImpl.elements) {
        interactions.push({
          refName,
          coordinate: elem.coordinate,
          element: elem.element,  // Direct DOM element reference
          elementType: getElementType(elem.element),
          supportedEvents: getSupportedEvents(elem.element),
          itemContext: elem.viewState,
        });
      }
    } else {
      // Single ref
      interactions.push({
        refName,
        coordinate: refImpl.coordinate,
        element: refImpl.element,  // Direct DOM element reference
        elementType: getElementType(refImpl.element),
        supportedEvents: getSupportedEvents(refImpl.element),
      });
    }
  }

  return interactions;
}

function getElementType(element: Element): string {
  return element.constructor.name; // e.g., "HTMLButtonElement"
}

function getSupportedEvents(element: Element): string[] {
  // Common events based on element type
  const base = ['click', 'focus', 'blur'];
  if (element instanceof HTMLInputElement) {
    return [...base, 'input', 'change'];
  }
  if (element instanceof HTMLButtonElement) {
    return ['click'];
  }
  if (element instanceof HTMLSelectElement) {
    return [...base, 'change'];
  }
  if (element instanceof HTMLTextAreaElement) {
    return [...base, 'input', 'change'];
  }
  return base;
}
```

#### 3. Event Trigger

```typescript
// packages/runtime-ai/lib/event-trigger.ts

export function triggerEvent(
  component: JayComponent<any, any, any>,
  eventType: string,
  coordinate: Coordinate,
  eventData?: object,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Find the element by coordinate
    const element = findElementByCoordinate(component, coordinate);
    if (!element) {
      reject(new Error(`No element found at coordinate: ${coordinate.join('/')}`));
      return;
    }

    // Create and dispatch the event
    const event = new Event(eventType, { bubbles: true });
    Object.assign(event, eventData);

    element.dispatchEvent(event);

    // Use microtask to let the event propagate
    queueMicrotask(resolve);
  });
}

function findElementByCoordinate(
  component: JayComponent<any, any, any>,
  coordinate: Coordinate,
): Element | null {
  // Navigate through refs using coordinate path
  // e.g., ["prod-123", "remove-btn"] → cartItems[prod-123].refs.remove-btn
  // This requires the runtime to expose ref lookup by coordinate
  return component.__findRefByCoordinate?.(coordinate) ?? null;
}
```

#### 4. Main API (Wrapper Pattern)

```typescript
// packages/runtime-ai/lib/ai-agent-api.ts

import type { JayComponent, JayElement } from '@jay-framework/runtime';
import { readViewState } from './state-reader';
import { collectInteractions } from './interaction-collector';
import type { AIAgentAPI, AIPageState, AIInteraction, Coordinate } from './types';

class AIAgent implements AIAgentAPI {
  private stateListeners = new Set<(state: AIPageState) => void>();
  private cachedInteractions: AIInteraction[] | null = null;

  constructor(private component: JayComponent<any, any, any>) {
    // Subscribe to component updates
    this.subscribeToUpdates();
  }

  private subscribeToUpdates(): void {
    // Hook into component's update mechanism
    // Intercept the update function to notify listeners
    const originalUpdate = this.component.update;
    this.component.update = (props) => {
      originalUpdate(props);
      this.cachedInteractions = null; // Invalidate cache
      this.notifyListeners();
    };
  }

  private notifyListeners(): void {
    const state = this.getPageState();
    this.stateListeners.forEach((callback) => callback(state));
  }

  getPageState(): AIPageState {
    if (!this.cachedInteractions) {
      this.cachedInteractions = collectInteractions(this.component.element.refs);
    }
    return {
      viewState: readViewState(this.component),
      interactions: this.cachedInteractions,
    };
  }

  triggerEvent(eventType: string, coordinate: Coordinate, eventData?: object): void {
    const interaction = this.getInteraction(coordinate);
    if (!interaction) {
      throw new Error(`No element found at coordinate: ${coordinate.join('/')}`);
    }

    const event = new Event(eventType, { bubbles: true });
    Object.assign(event, eventData);
    interaction.element.dispatchEvent(event);
  }

  getInteraction(coordinate: Coordinate): AIInteraction | undefined {
    const state = this.getPageState();
    return state.interactions.find(
      (i) => i.coordinate.length === coordinate.length &&
             i.coordinate.every((c, idx) => c === coordinate[idx])
    );
  }

  onStateChange(callback: (state: AIPageState) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }
}

/** Wrapper type that adds AI capabilities to a component */
export type AIWrappedComponent<T> = T & { ai: AIAgentAPI };

/**
 * Wraps a Jay component with AI agent capabilities.
 * Does not use any global state - the AI API is attached to the instance.
 */
export function wrapWithAIAgent<T extends JayComponent<any, any, any>>(
  component: T,
): AIWrappedComponent<T> {
  const agent = new AIAgent(component);
  return Object.assign(component, { ai: agent });
}
```

### Runtime Hooks Required

The AI package needs minimal hooks in the main runtime:

```typescript
// Additions to @jay-framework/runtime

// 1. Expose ViewState (read-only)
interface JayComponent<Props, ViewState, JayElementT> {
  // ... existing
  __viewState?: ViewState; // Exposed for AI agent
}

// 2. Expose refs with element and coordinate info
// Already available via component.element.refs
// The ref implementations already have:
// - element: the DOM element
// - coordinate: the coordinate path
// - viewState: the item's ViewState (for collection refs)
```

**Key insight**: Most functionality is already available:
- `component.element.refs` exposes all refs
- Each ref has `element`, `coordinate`, and `viewState`
- The AI package wraps `component.update` to detect state changes

The only new hook needed is `__viewState` for read access to current ViewState.

## Implementation Plan

### Phase 1: Core Infrastructure

1. Create `runtime-ai` package structure
2. Define types (`types.ts`)
3. Implement `wrapWithAIAgent` function
4. Add `__viewState` hook to runtime component

**Tests:**

- Can wrap component with AI agent
- Wrapped component still functions normally
- `ai` property available on wrapped component

### Phase 2: State Reading & Interaction Collection

1. Implement state reader (read ViewState via `__viewState`)
2. Implement interaction collector (traverse refs)
3. Include DOM element references in interactions
4. Handle collection refs (forEach items) with coordinates

**Tests:**

- `getPageState()` returns ViewState
- Interactions include all refs with correct coordinates
- forEach items have correct `itemContext`
- DOM elements accessible via `interaction.element`

### Phase 3: Event Triggering

1. Implement `triggerEvent` (dispatch event on element)
2. Implement `getInteraction` (coordinate lookup)
3. Test event propagation and state updates

**Tests:**

- Trigger click on button
- Trigger click on forEach item
- Events update ViewState correctly
- Input value change via element + input event

### Phase 4: State Change Notification

1. Wrap component's update function to detect changes
2. Implement `onStateChange` callback registration
3. Notify all listeners on ViewState change

**Tests:**

- Listener called on state change
- Multiple listeners work
- Unsubscribe works correctly
- Listener receives updated state

### Phase 5: Developer Experience

1. Jay Stack dev server integration (auto-wrap in dev mode)
2. TypeScript types for wrapped components
3. Documentation and examples

## Examples

### Example 1: Shopping Cart

```html
<!-- cart.jay-html -->
<ul>
  <li forEach="cartItems" trackBy="productId">
    <span>{productName}</span>
    <span>{quantity} x ${price}</span>
    <button ref="remove">Remove</button>
    <button ref="increase">+</button>
    <button ref="decrease">-</button>
  </li>
</ul>
<button ref="checkout">Checkout (${total})</button>
```

```typescript
// Setup: wrap component with AI agent
import { wrapWithAIAgent } from '@jay-framework/runtime-ai';

const instance = CartPage({ items: initialItems });
const aiInstance = wrapWithAIAgent(instance);
target.appendChild(aiInstance.element.dom);

// AI Agent interaction via instance.ai
const state = aiInstance.ai.getPageState();
console.log(state.viewState);
// → { cartItems: [{ productId: 'abc', productName: 'Widget', ... }], total: 29.99 }

console.log(state.interactions);
// → [
//   { refName: 'remove', coordinate: ['abc', 'remove'], element: <button>, itemContext: {...} },
//   { refName: 'increase', coordinate: ['abc', 'increase'], element: <button>, ... },
//   { refName: 'decrease', coordinate: ['abc', 'decrease'], element: <button>, ... },
//   { refName: 'checkout', coordinate: ['checkout'], element: <button>, ... }
// ]

// Subscribe to state changes
const unsubscribe = aiInstance.ai.onStateChange((newState) => {
  console.log('Cart updated:', newState.viewState.cartItems.length);
});

// Remove item 'abc' from cart
aiInstance.ai.triggerEvent('click', ['abc', 'remove']);
// → Console: "Cart updated: 0"

// Cleanup
unsubscribe();
```

### Example 2: Form Filling

```html
<!-- checkout.jay-html -->
<form>
  <input ref="name" type="text" value="{customerName}" placeholder="Full Name" />
  <input ref="email" type="email" value="{email}" placeholder="Email" />
  <select ref="country" value="{selectedCountry}">
    <option value="us">United States</option>
    <option value="uk">United Kingdom</option>
  </select>
  <button ref="submit">Place Order</button>
</form>
```

```typescript
// AI Agent fills form by setting DOM values directly
const state = aiInstance.ai.getPageState();

// Get the name input element and set its value
const nameInput = aiInstance.ai.getInteraction(['name']).element as HTMLInputElement;
nameInput.value = 'John Doe';
aiInstance.ai.triggerEvent('input', ['name']);

// Get email input and set value
const emailInput = aiInstance.ai.getInteraction(['email']).element as HTMLInputElement;
emailInput.value = 'john@example.com';
aiInstance.ai.triggerEvent('input', ['email']);

// Get country select and set value
const countrySelect = aiInstance.ai.getInteraction(['country']).element as HTMLSelectElement;
countrySelect.value = 'us';
aiInstance.ai.triggerEvent('change', ['country']);

// Submit the form
aiInstance.ai.triggerEvent('click', ['submit']);
```

### Example 3: Nested Collections

```html
<!-- category-page.jay-html -->
<div forEach="categories" trackBy="id">
  <h2>{categoryName}</h2>
  <ul>
    <li forEach="products" trackBy="productId">
      <span>{productName}</span>
      <button ref="addToCart">Add to Cart</button>
    </li>
  </ul>
</div>
```

```typescript
// Coordinate for nested forEach: [categoryId, productId, refName]
aiInstance.ai.triggerEvent('click', ['electronics', 'laptop-123', 'addToCart']);

// Find specific product's add button
const laptopAddBtn = aiInstance.ai.getInteraction(['electronics', 'laptop-123', 'addToCart']);
console.log(laptopAddBtn.itemContext);
// → { productId: 'laptop-123', productName: 'Pro Laptop', price: 999 }
```

### Example 4: Jay Stack Dev Mode Integration

```typescript
// In jay-stack client bootstrap (dev mode only)
import { wrapWithAIAgent } from '@jay-framework/runtime-ai';

const target = document.getElementById('target');
const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap);
let instance = pageComp({ ...viewState, ...fastCarryForward });

// Conditionally wrap in dev mode
if (import.meta.env.DEV) {
  instance = wrapWithAIAgent(instance);
  console.log('AI Agent enabled - access via instance.ai');
}

target.appendChild(instance.element.dom);
```

## Trade-offs

### Advantages

1. **Zero runtime cost when not used**: Separate package, tree-shakeable
2. **No global state**: AI API attached to component instance, not window
3. **Type-safe**: Full TypeScript support
4. **Consistent with Jay architecture**: Uses existing coordinate system and refs
4. **Secure**: Can be disabled in production
5. **Framework-agnostic**: AI agents work with any Jay component

### Disadvantages

1. **Runtime hooks required**: Small additions to core runtime
2. **Coordinate complexity**: Nested collections have long coordinates
3. **Event timing**: Async nature requires careful handling
4. **Security surface**: Potential for automation abuse

### Alternatives Considered

1. **DOM-based automation (Puppeteer-style)**

   - Rejected: Doesn't leverage Jay's structured approach
   - Fragile to styling/layout changes

2. **GraphQL-style query API**

   - Rejected: Over-engineered for the use case
   - Adds complexity without benefit

3. **Built into core runtime**
   - Rejected: Violates "keep runtime small" requirement
   - Always bundled even when not used

## Verification Criteria

1. ✅ Separate package doesn't affect core bundle size
2. ✅ Can read ViewState from any component
3. ✅ Can list all interactions including forEach items
4. ✅ Can trigger events and observe state changes
5. ✅ Works with nested collections
6. ✅ Input elements can be read and modified
7. ✅ Dev mode can auto-enable
8. ✅ Production can disable completely

## Open Questions

1. **Should coordinates be human-readable paths?**

   - Current: `['prod-123', 'remove']`
   - Alternative: `'cartItems.prod-123.remove'`

2. **How to handle navigation events?**

   - Links that cause page navigation
   - Should `waitForStateChange` detect navigation?

3. **Support for custom events?**
   - Components can emit custom events (e.g., `onAddToCart`)
   - Should AI be able to listen/trigger these?

---

## Related Design Logs

- **#05 - Events**: Event binding architecture
- **#14 - References API**: Ref implementation
- **#50 - Rendering Phases**: ViewState and phases
- **#75 - Slow Rendering**: slowForEach and coordinates
