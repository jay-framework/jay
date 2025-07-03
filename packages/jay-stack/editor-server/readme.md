# @jay-framework/editor-server

Socket.io server implementation for Jay dev servers to handle editor integration.

## Overview

This package provides a Socket.io server that can be integrated into Jay dev servers to handle real-time communication with editor applications. It includes:

- Port discovery and automatic port allocation
- Socket.io server setup with CORS support
- Protocol message handling for publish, saveImage, and hasImage operations
- Default protocol handlers for file operations
- Configuration management via `.jay` files

## Usage

```typescript
import { createEditorServer, createDefaultHandlers } from '@jay-framework/editor-server';

// Create the editor server
const server = createEditorServer({
  projectRoot: '/path/to/project',
  portRange: [3101, 3200]
});

// Create default handlers for file operations
const handlers = createDefaultHandlers({
  projectRoot: '/path/to/project',
  assetsDir: '/path/to/project/public/assets'
});

// Register protocol handlers
server.onPublish(handlers.handlePublish.bind(handlers));
server.onSaveImage(handlers.handleSaveImage.bind(handlers));
server.onHasImage(handlers.handleHasImage.bind(handlers));

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

### Configuration
- Reads from `.jay` configuration file
- Auto-generates configuration when in init mode
- Supports custom port ranges and editor IDs

## Integration with Dev Server

This package is designed to be integrated into the existing `@jay-framework/dev-server` package to provide editor integration capabilities. 