# @jay-framework/editor-client

Socket.io client implementation for editor applications to connect to Jay dev servers.

## Overview

This package provides a Socket.io client that can be used by editor applications to connect to Jay dev servers and perform real-time operations. It includes:

- Automatic port discovery and server connection
- Socket.io client with automatic reconnection
- Protocol message handling for publish, saveImage, and hasImage operations
- Connection state management
- Type-safe protocol implementation with wrapper message structure

## Usage

### Basic Usage

```typescript
import { createEditorClient } from '@jay-framework/editor-client';

// Create the editor client
const client = createEditorClient({
  portRange: [3101, 3200],
  scanTimeout: 5000,
  retryAttempts: 3,
  editorId: 'my-editor-123',
});

// Connect to the dev server
await client.connect();

// Publish a jay-html file
const result = await client.publish({
  type: 'publish',
  pages: [
    {
      route: '/pages',
      jayHtml: '<div>Hello World</div>',
      name: 'home',
    },
  ],
});

console.log('Published:', result.status[0].filePath);
```

### Advanced Usage with Custom Connection Manager

```typescript
import {
  createEditorClientWithConnectionManager,
  createConnectionManager,
} from '@jay-framework/editor-client';

// Create a custom connection manager
const connectionManager = createConnectionManager({
  portRange: [3101, 3200],
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectAttempts: 5,
});

// Create editor client with the connection manager
const client = createEditorClientWithConnectionManager(connectionManager);

// Connect and handle state changes
await client.connect();

client.onConnectionStateChange((state) => {
  console.log('Connection state:', state);
});

// Use protocol methods
const imageResult = await client.saveImage({
  type: 'saveImage',
  imageId: 'my-image',
  imageData:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
});

console.log('Image saved:', imageResult.imageUrl);
```

## Features

### Port Discovery

- Automatically scans port range to find available dev servers
- Supports both "init" mode and "configured" mode servers
- Configurable scan timeout and retry attempts

### Protocol Support

- **Publish**: Send jay-html files to the dev server
- **Save Image**: Upload base64 image data to server assets
- **Has Image**: Check if an image already exists on the server

### Connection Management

- Automatic reconnection with exponential backoff
- Connection state monitoring
- Request timeout handling
- Error handling and recovery

### Type Safety

- Full TypeScript support with wrapper message structure
- Protocol interface compliance with `id`, `timestamp`, and `payload` fields
- Type-safe request/response handling

## Architecture

The package follows a clean separation of concerns:

- **EditorClient**: High-level API that implements the `EditorProtocol` interface
- **ConnectionManager**: Handles all connection logic, port discovery, and message transport

### Protocol Message Structure

All messages use a wrapper structure:

```typescript
interface ProtocolMessage {
  id: string;
  timestamp: number;
  payload: {
    type: 'publish' | 'saveImage' | 'hasImage';
    // ... message-specific fields
  };
}
```

## Configuration Options

```typescript
interface ConnectionManagerOptions {
  portRange?: [number, number]; // Default: [3101, 3200]
  scanTimeout?: number; // Default: 5000ms
  retryAttempts?: number; // Default: 3
  editorId?: string; // Auto-generated UUID if not provided
  autoReconnect?: boolean; // Default: true
  reconnectDelay?: number; // Default: 1000ms
  maxReconnectAttempts?: number; // Default: 5
}
```

## Testing

Comprehensive test suite including:

- Unit tests for all components
- End-to-end tests with real Socket.io servers
- Multiple server and client scenarios
- Connection state and error handling tests
- Protocol message validation

## Integration with Editor Applications

This package is designed to be used by any editor application that needs to communicate with Jay dev servers, such as:

- Figma plugins
- Web-based editors
- Desktop applications
- Browser extensions

interface EditorClientOptions extends ConnectionManagerOptions {
// Additional editor-specific options can be added here
}

```

## Integration with Editor Applications

This package is designed to be used by any editor application that needs to communicate with Jay dev servers, such as:

- Figma plugins
- Web-based editors
- Desktop applications
- Browser extensions
```
