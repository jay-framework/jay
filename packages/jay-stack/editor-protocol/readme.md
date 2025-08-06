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
  publish: async (params) => ({ 
    status: [{ 
      success: true, 
      filePath: '/test.jay-html',
      contractPath: '/test.jay-contract' // Optional contract file path
    }] 
  }),
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
const pages = [
  { route: '/home', jayHtml: '<div>Home</div>', name: 'Home' },
  { 
    route: '/about', 
    jayHtml: '<div>{title}</div>', 
    name: 'About', 
    contract: `name: About
tags:
  - tag: title
    type: data
    dataType: string
    required: true` 
  },
];

const components = [
  { jayHtml: '<button>Click me</button>', name: 'Button' },
  { 
    jayHtml: '<div>{count}</div>', 
    name: 'Counter', 
    contract: `name: Counter
tags:
  - tag: count
    type: data
    dataType: number
    required: true` 
  },
];

const publishMessage = createPublishMessage(pages, components);
const protocolMessage = createProtocolMessage(publishMessage);
```

## Constructor Functions

### Message Constructors

- `createPublishMessage(pages?, components?)` - Creates a publish message with optional pages and components
- `createSaveImageMessage(imageId, imageData)` - Creates a save image message
- `createHasImageMessage(imageId)` - Creates a has image message
- `createProtocolMessage(payload)` - Creates a protocol message wrapper with auto-generated timestamp-based ID

### Response Constructors

- `createPublishResponse(status)` - Creates a publish response
- `createSaveImageResponse(success, imageUrl?, error?)` - Creates a save image response
- `createHasImageResponse(exists, imageUrl?)` - Creates a has image response
- `createProtocolResponse(id, payload)` - Creates a protocol response wrapper with timestamp

## Protocol Operations

### Publish

Publishes jay-html files and optional jay-contract files to the dev server. Pages are published at specified routes, while components are published to the components directory.

**Features:**
- **Pages**: Published as `page.jay-html` and optional `page.jay-contract` files
- **Components**: Published as `{name}.jay-html` and optional `{name}.jay-contract` files
- **Contract Support**: Optional contract content for headless components
- **Backward Compatibility**: Contract publishing is optional and doesn't break existing workflows

### Save Image

Saves base64 image data to the dev server's public assets.

### Has Image

Checks if an image with the given ID already exists on the server.

## Contract Publishing

Contract files enable headless component support by defining the component's data interface and refs structure. When publishing components or pages, you can optionally include contract content:

```typescript
// Publishing a headless component with contract
const component = {
  jayHtml: '<div><span>{count}</span><button ref="increment">+</button></div>',
  name: 'Counter',
  contract: `name: Counter
tags:
  - tag: count
    type: data
    dataType: number
    required: true
  - tag: increment
    type: interactive
    elementType: HTMLButtonElement
    description: Button to increment the counter`
};

const message = createPublishMessage(undefined, [component]);
```

The contract file will be saved alongside the jay-html file and can be referenced in other components using the `contract` attribute in jay-headless imports.
