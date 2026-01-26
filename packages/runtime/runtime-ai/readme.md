# @jay-framework/runtime-ai

AI Agent integration for Jay components. Enables AI agents to:

- Read current page state (ViewState)
- Discover available interactions (refs with coordinates)
- Trigger events on elements
- Subscribe to state changes
- Listen to custom component events

## Installation

```bash
npm install @jay-framework/runtime-ai
```

## Usage

```typescript
import { wrapWithAIAgent } from '@jay-framework/runtime-ai';

// Wrap your component with AI capabilities
const instance = MyComponent(props);
const aiInstance = wrapWithAIAgent(instance);

// Mount as usual
target.appendChild(aiInstance.element.dom);

// AI API is available on the instance
const state = aiInstance.ai.getPageState();
console.log(state.viewState);      // Current data
console.log(state.interactions);   // Available actions

// Trigger events
aiInstance.ai.triggerEvent('click', ['product-123', 'remove']);

// Subscribe to state changes
const unsubscribe = aiInstance.ai.onStateChange((newState) => {
  console.log('State updated:', newState.viewState);
});
```

## API

### `wrapWithAIAgent(component)`

Wraps a Jay component with AI agent capabilities.

### `AIAgentAPI`

- `getPageState()` - Get current ViewState and available interactions
- `triggerEvent(type, coordinate, data?)` - Trigger an event on an element
- `getInteraction(coordinate)` - Get a specific interaction by coordinate
- `onStateChange(callback)` - Subscribe to ViewState changes
- `getCustomEvents()` - List custom events the component emits
- `onComponentEvent(name, callback)` - Subscribe to a custom component event

## Design

See [Design Log #76 - AI Agent Integration](../../design-log/76%20-%20AI%20Agent%20Integration.md) for full design documentation.
