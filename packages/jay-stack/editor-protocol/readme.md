# @jay-framework/editor-protocol

Shared TypeScript interfaces and types for the Jay editor integration protocol.

## Overview

This package provides the shared protocol definitions for communication between editor applications and Jay dev servers. It includes:

- `EditorProtocol` - Interface for editor-side operations
- `DevServerProtocol` - Interface for dev server-side handlers
- Message format types for WebSocket communication
- Configuration and connection state types

## Usage

```typescript
import type {
  EditorProtocol,
  DevServerProtocol,
  EditorConfig,
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
```

## Protocol Operations

### Publish

Publishes jay-html files to the dev server at specified routes.

### Save Image

Saves base64 image data to the dev server's public assets.

### Has Image

Checks if an image with the given ID already exists on the server.
