# @jay-framework/editor-server

Socket.io server implementation for Jay dev servers to handle editor integration.

## Overview

This package provides a Socket.io server that can be integrated into Jay dev servers to handle real-time communication with editor applications. It includes:

- Port discovery and automatic port allocation
- Socket.io server setup with CORS support
- Protocol message handling for publish, saveImage, and hasImage operations
- Default protocol handlers for file operations
- Configuration management via `.jay` files
- Memory filesystem support for testing

## Usage

```typescript
import { createEditorServer, createDefaultHandlers } from '@jay-framework/editor-server';

// Create the editor server
const server = createEditorServer({
  projectRoot: '/path/to/project',
  portRange: [3101, 3200],
});

const handlePublish: EditorProtocol['publish'] = () => {} // callback implementation
const handleSaveImage: EditorProtocol['saveImage'] = () => {} // callback implementation
const handleHasImage: EditorProtocol['hasImage'] = () => {} // callback implementation
    
// Register protocol handlers
server.onPublish(handlePublish);
server.onSaveImage(handleSaveImage);
server.onHasImage(handleHasImage);

// Start the server
const { port, editorId } = await server.start();
console.log(`Editor server running on port ${port} with ID ${editorId}`);

// Stop the server when done
await server.stop();
```

## Features

### Port Discovery

- Automatically finds available ports in the configured range
- Provides HTTP endpoint for editor port discovery
- Supports both "init" mode and "configured" mode

### Protocol Support

- **Publish**: Saves jay-html files to the project
- **Save Image**: Saves base64 image data to assets directory
- **Has Image**: Checks if an image already exists

### Protocol Message Structure

All messages use a wrapper structure with `id`, `timestamp`, and `payload` fields for reliable communication.

### Configuration
- optional `editorId` config
  - if omitted, starts with `init` mode supporting discovery of `editorId` and callback `onEditorId` to save `editorId`
  - if provided, only accepts connection with the same `editorId`
- Supports custom port ranges

## Integration with Dev Server

This package is designed to be integrated into the existing `@jay-framework/dev-server` package to provide editor integration capabilities.
