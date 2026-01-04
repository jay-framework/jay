# Vendor API Quick Reference

## Protocol Messages

The vendor integration uses the **Jay Editor Server Protocol** (WebSocket-based) for communication.

### Export Design

**Message Type**: `export`

Send a design from your editor to Jay.

**Message:**

```typescript
{
  type: 'export',
  vendorId: string,        // e.g., 'figma', 'myeditor'
  pageUrl: string,         // e.g., '/home'
  vendorDoc: TVendorDoc    // Your vendor-specific document (strongly typed!)
}
```

**Response:**

```typescript
{
  type: 'export',
  success: boolean,
  vendorSourcePath?: string,
  jayHtmlPath?: string,
  contractPath?: string,
  warnings?: string[],
  error?: string
}
```

### Import Design

**Message Type**: `import`

Retrieve a design from Jay to your editor.

**Message:**

```typescript
{
  type: 'import',
  vendorId: string,
  pageUrl: string
}
```

**Response:**

```typescript
{
  type: 'import',
  success: boolean,
  vendorDoc?: TVendorDoc,  // Your original vendor document (strongly typed!)
  error?: string
}
```

## Example Usage

### TypeScript (Editor Plugin with Editor Client)

```typescript
import { EditorClient } from '@jay-framework/editor-client';

// Define your document type
interface MyDesignDoc {
  name: string;
  nodes: any[];
}

// Initialize client
const client = new EditorClient({
  editorId: 'my-editor-plugin',
  portRange: [3101, 3200],
});

await client.connect();

// Export to Jay with type safety
async function exportToJay(pageUrl: string, design: MyDesignDoc) {
  const response = await client.export<MyDesignDoc>({
    type: 'export',
    vendorId: 'myeditor',
    pageUrl: pageUrl,
    vendorDoc: design, // ✅ Strongly typed
  });

  console.log(response.success ? 'Exported!' : response.error);
}

// Import from Jay with type safety
async function importFromJay(pageUrl: string) {
  const response = await client.import<MyDesignDoc>({
    type: 'import',
    vendorId: 'myeditor',
    pageUrl: pageUrl,
  });

  if (response.success && response.vendorDoc) {
    return response.vendorDoc; // ✅ Typed as MyDesignDoc
  }
  throw new Error(response.error);
}

await client.disconnect();
```

### Manual WebSocket Usage (Without Client Library)

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3101', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('Connected to Jay Editor Server');
});

// Send export message
function sendExport<TVendorDoc>(vendorId: string, pageUrl: string, vendorDoc: TVendorDoc) {
  const message = {
    id: generateUniqueId(),
    timestamp: Date.now(),
    payload: {
      type: 'export',
      vendorId,
      pageUrl,
      vendorDoc,
    },
  };

  socket.emit('protocol-message', message);
}

// Listen for responses
socket.on('protocol-response', (response) => {
  if (response.payload.type === 'export') {
    console.log('Export result:', response.payload);
  } else if (response.payload.type === 'import') {
    console.log('Import result:', response.payload);
  }
});

function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

## Error Responses

All protocol responses include consistent error handling:

```typescript
{
  type: 'export' | 'import',
  success: false,
  error: 'Error message here'
}
```

Common error scenarios:

- **Adapter not found**: Unknown `vendorId`
- **Page not found**: No vendor source file exists for import
- **Conversion failure**: Adapter failed to convert document
- **Connection error**: WebSocket connection issues

## Available Vendors

Check what vendors are available by starting the dev server:

```bash
npx jay dev
# Output: 🎨 Vendor API enabled for: figma, wix, penpot
```

## Connection Details

- **Protocol**: WebSocket (Socket.IO)
- **Port Range**: 3101-3200 (automatically discovered)
- **Transport**: WebSocket only (no polling)
- **Message Format**: JSON with `id`, `timestamp`, and `payload`

## File Structure

After exporting a design to `/home`:

```
src/pages/home/
├── page.figma.json      # Source of truth (your vendor format)
├── page.jay-html        # Generated Jay HTML
└── page.jay-contract    # Optional contract (if generated)
```

## See Also

- [Complete Vendor Integration Guide](./vendor-integration.md) - Full documentation
- [Creating a Vendor Adapter](../packages/jay-stack/stack-cli/lib/vendor-adapters/README.md) - Implementation guide
