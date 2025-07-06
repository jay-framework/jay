# @jay-framework/editor-protocol

Shared TypeScript interfaces and types for the Jay editor integration protocol.

## Overview

This package provides the shared protocol definitions for communication between editor applications and Jay dev servers. It includes:

- `EditorProtocol` - Interface for editor-side operations
- `DevServerProtocol` - Interface for dev server-side handlers
- Message format types for WebSocket communication
- Configuration and connection state types
- Constructor functions for creating messages and responses

## Usage

```typescript
import type {
  EditorProtocol,
  DevServerProtocol,
  EditorConfig,
} from '@jay-framework/editor-protocol';

import {
  createPublishMessage,
  createSaveImageMessage,
  createHasImageMessage,
  createProtocolMessage,
} from '@jay-framework/editor-protocol';

// Use in editor applications
const editor: EditorProtocol = {
  publish: async (params) => ({ status: [{ success: true, filePath: '/test.jay-html' }] }),
  saveImage: async (params) => ({ success: true, imageUrl: '/assets/image.png' }),
  hasImage: async (params) => ({ exists: true, imageUrl: '/assets/image.png' }),
};

// Use in dev servers
const server: DevServerProtocol = {
  onPublish: (callback) => {},
  onSaveImage: (callback) => {},
  onHasImage: (callback) => {},
};

// Create messages using constructors
const publishMessage = createPublishMessage([
  { route: '/home', jayHtml: '<div>Home</div>', name: 'Home' }
]);

const protocolMessage = createProtocolMessage(publishMessage);
```

## Constructor Functions

### Message Constructors

- `createPublishMessage(pages)` - Creates a publish message
- `createSaveImageMessage(imageId, imageData)` - Creates a save image message
- `createHasImageMessage(imageId)` - Creates a has image message
- `createProtocolMessage(payload)` - Creates a protocol message wrapper with auto-generated ID and timestamp

### Response Constructors

- `createPublishResponse(status)` - Creates a publish response
- `createSaveImageResponse(success, imageUrl?, error?)` - Creates a save image response
- `createHasImageResponse(exists, imageUrl?)` - Creates a has image response
- `createProtocolResponse(id, payload)` - Creates a protocol response wrapper with timestamp



## Protocol Operations

### Publish

Publishes jay-html files to the dev server at specified routes.

### Save Image

Saves base64 image data to the dev server's public assets.

### Has Image

Checks if an image with the given ID already exists on the server.
