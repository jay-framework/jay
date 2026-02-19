# @jay-framework/runtime-automation

Automation API for Jay components. Enables programmatic automation to:

- Read current page state (ViewState)
- Discover available interactions (refs with coordinates)
- Trigger events on elements
- Subscribe to state changes
- Listen to custom component events

**Use cases**: AI agents, test automation, accessibility tools, E2E testing.

## Installation

```bash
npm install @jay-framework/runtime-automation
```

## Usage

```typescript
import { wrapWithAutomation } from '@jay-framework/runtime-automation';

// Wrap your component with automation capabilities
const instance = MyComponent(props);
const wrapped = wrapWithAutomation(instance);

// Mount as usual
target.appendChild(wrapped.element.dom);

// Automation API is available on the instance
const state = wrapped.automation.getPageState();
console.log(state.viewState); // Current data
console.log(state.interactions); // Available actions

// Trigger events
wrapped.automation.triggerEvent('click', ['product-123', 'remove']);

// Subscribe to state changes
const unsubscribe = wrapped.automation.onStateChange((newState) => {
  console.log('State updated:', newState.viewState);
});
```

## Browser Console Usage

```javascript
// Expose to window for console access
window.app = wrapped;

// Then from console:
app.automation.getPageState();
app.automation.triggerEvent('click', ['item-1', 'removeBtn']);
```

## API

### `wrapWithAutomation(component)`

Wraps a Jay component with automation capabilities.

### `AutomationAPI`

- `getPageState()` - Get current ViewState and available interactions
- `triggerEvent(type, coordinate, data?)` - Trigger an event on an element
- `getInteraction(coordinate)` - Get a specific interaction by coordinate
- `onStateChange(callback)` - Subscribe to ViewState changes
- `getCustomEvents()` - List custom events the component emits
- `onComponentEvent(name, callback)` - Subscribe to a custom component event
- `dispose()` - Clean up listeners

## Jay-Stack Integration

In jay-stack dev mode, the generated client script automatically wraps the page component with automation and exposes it on `window.__jay.automation`. A `jay:automation-ready` event is dispatched on `window` immediately after the automation instance is set.

### Accessing automation from plugins

Plugin client inits run **before** the page component is created, so `window.__jay.automation` is not yet available during init. Listen for the ready event:

```typescript
// In a plugin's client init
const automation = (window as any).__jay?.automation;
if (automation) {
    // Already available
    setup(automation);
} else {
    window.addEventListener('jay:automation-ready', () => {
        setup((window as any).__jay.automation);
    }, { once: true });
}
```

### Accessing automation from interactive components

Component interactive phases run after the page is mounted and automation is set. Access it directly:

```typescript
const automation: AutomationAPI | null = (window as any).__jay?.automation || null;
```

If the component may initialize before automation is ready (e.g. in a plugin), use the event pattern above.

## Design

See [Design Log #76 - AI Agent Integration](../../../design-log/76%20-%20AI%20Agent%20Integration.md) for full design documentation.
