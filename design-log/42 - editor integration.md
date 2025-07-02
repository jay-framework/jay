# Editor Integration Protocol

## Overview

A protocol for connecting browser-based editor applications to locally running Jay dev servers, enabling real-time development workflows with proper isolation between multiple editor tabs and dev server instances.

## Problem

When developing Jay applications, we need a way for editor applications running in browser tabs to connect to locally running dev server processes. This creates several challenges:

1. **Multiple Editor Tabs**: A user may have multiple editor tabs open, each working on different projects
2. **Multiple Dev Servers**: Each project may have its own dev server process running locally
3. **Dual Port Requirements**: Each dev server needs two ports - one for HTTP traffic of the site in development, and one for editor communication
4. **Port Management**: We need to avoid port conflicts and ensure proper routing between tabs and servers
5. **Connection Isolation**: Each editor tab should connect to the correct dev server instance

## Solution: ID-Based Port Discovery

### Core Protocol

1. **Tab ID Generation**: Each editor tab generates a unique ID (UUID) when it loads
2. **Dev Server Configuration**: Dev servers can be configured with a specific ID or start in "init" mode
3. **Port Range Scanning**: Editor tabs scan a predefined range of ports to find the matching dev server
4. **Connection Establishment**: Once found, the tab establishes a WebSocket connection to the dev server
5. **2 Way Messaging**: Two way Message based communication on top of WebSockets, packaged as two TS interfaces (dev server and editor)

### Dev Server States

#### Init Mode
- Dev server starts without a specific ID
- Accepts the first connection request and adopts that tab's ID, updating into `.jay` config file
- Responds to any ID during the scanning phase
- Once connected, locks to that specific ID

#### Configured Mode
- Dev server starts with a specific ID (via `.jay` config file)
- Only responds to connection requests with the matching ID
- Rejects connections with non-matching IDs

### Connection Flow

```
Editor Tab                    Dev Server
     |                           |
     |-- Generate UUID --------->|
     |                           |
     |-- Scan ports 3000-3100 -->|
     |                           |
     |<-- ID Match Response -----|
     |                           |
     |-- WebSocket Connect ----->|
     |                           |
     |<-- Connection Established-|
```

### Port Scanning Strategy

1. **Dual Port Discovery**: Editor tabs scan for the editor communication ports
2. **Default Port Ranges**: 
   - HTTP site ports: 3000-3100
   - Editor communication ports: 3101-3200
3. **Parallel Scanning**: Send HTTP requests to each port in parallel
4. **ID Matching**: Each request includes the tab's UUID
5. **Response Format**: Dev servers respond with their current ID or "init" status
6. **WebSocket Connect**: Editor Tab connects to the dev server with matching ID, or to one of the dev servers with "init" status. 
   If connecting to a dev server with "init" status, it stores the UUID provided.

### Implementation Details

#### Dev Server Endpoint
```
GET /editor-connect?id={tabId}
Response: { "status": "init" | "configured", "id": "server-id" }
```

#### WebSocket Upgrade
```
GET /editor-ws?id={tabId}
Upgrade: websocket
```

### Benefits

1. **Automatic Discovery**: No manual port configuration needed
2. **Isolation**: Each tab connects to the correct dev server
3. **Flexibility**: Supports both automatic and manual ID assignment
4. **Scalability**: Can handle multiple concurrent development sessions
5. **Security**: ID-based matching prevents unauthorized connections

## Configuration: .jay File

The `.jay` file is a YAML configuration file that stores project-specific settings for the editor integration protocol.

### File Structure

```yaml
# .jay
editor:
  id: "550e8400-e29b-41d4-a716-446655440000"  # Optional: specific editor ID
  portRanges:
    http: [3000, 3100]  # HTTP site port range
    editor: [3101, 3200]  # Editor communication port range
```

### Configuration Options

- **`editor.id`**: Optional UUID for the editor connection. If not specified, the dev server starts in init mode
- **`editor.id`**: Optional UUID for the editor connection. If not specified, the dev server starts in init mode
- **`editor.portRanges.http`**: Port range for the HTTP site server (default: [3000, 3100])
- **`editor.portRanges.editor`**: Port range for editor communication (default: [3101, 3200])

### Auto-Generation

When a dev server in init mode accepts its first connection, it automatically creates or updates the `.jay` file with the editor ID and current port configuration.
