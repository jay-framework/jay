# 93 - Import-Export Workflow (Pillar 2)

**Status:** Architecture (reviewed — issues fixed, ready for planning)  
**Date:** 2026-02-25  
**Master plan:** `jay-desktop-poc/docs/parallel-pillars-master-plan.md` (Pillar 2 section)  
**Prerequisites:**

- [single-writer-design-ownership.md](../../../jay-desktop-poc/docs/design-log/single-writer-design-ownership.md) (adopted)
- [single-writer-import-export-system-design.md](../../../jay-desktop-poc/docs/design-log/single-writer-import-export-system-design.md) (Phase 1 partially designed)
- Pillar 1 design (Compute Styles) — Pillar 2 does NOT depend on Pillar 1 for its core functionality, but P2-3's "View diff" may optionally use computed styles for visual comparison in a later phase

---

## Background

The single-writer model is adopted: the designer owns `page.jay-html`. It's modified by Figma export or by an AI agent the designer operates externally (Phase 1: filesystem-based AI via Cursor/CLI). The developer never touches jay-html.

Today, import and export are stateless fire-and-forget operations. The plugin has no awareness of whether the jay-html on disk matches what's on the Figma canvas. The single-writer import-export design (already written) adds re-import-with-replace and a basic `diskDiverged` check on export. But the designer still has no real-time awareness of file changes, no per-page sync status, and no structured workflow for resolving conflicts when both Figma and the filesystem have been modified.

**What exists today:**

- Import: jay-html → parse → Import IR → FigmaVendorDocument → Figma nodes (works, full replace)
- Export: Figma nodes → serialize → FigmaVendorDocument → jay-html on disk (works)
- No file watching for jay-html in the editor protocol
- No server-initiated push (editor server is request-response only)
- No Figma modification tracking
- No per-page sync status

---

## Problem

The designer works with two tools — Figma (visual) and an AI agent (structural). Both modify the same artifact (jay-html) through different channels:

```
Figma → [Export] → writes jay-html to disk
AI agent → directly edits jay-html on disk
```

When the designer makes changes in Figma AND the AI modifies jay-html, neither side knows about the other. The designer discovers this only at export time (if we implement `diskDiverged`) or worse — silently overwrites the AI's work.

**Pillar 2 solves this** by adding:

1. Real-time awareness of jay-html file changes in the plugin
2. Per-page sync status indicators
3. Conflict detection when both sides have changed
4. Conflict resolution UX with actionable options
5. A smooth multi-cycle workflow (AI edit → import → design → export → repeat)

---

## Questions

**Q1: How do we detect Figma-side modifications?**

A: Use Figma's `documentchange` event in the plugin sandbox. When a node inside a jay page section changes, set a `figmaModified` flag for that page. The flag is cleared on successful export. This is lightweight — no serialization needed, just tracking the boolean dirty state.

**Q2: Should sync state survive server restarts?**

A: No server-side persistence. The plugin stores `jay-sync-content-hash` on each SECTION's plugin data (survives Figma sessions). On reconnect, the plugin sends all page hashes to the server via `sync-subscribe`, and the server compares with current files on disk to establish initial status. This makes the system resilient without adding persistence complexity.

**Q3: How detailed should the "View diff" be?**

A: Show a unified text diff of the jay-html changes (baseline vs current file). The baseline (`page.jay-html.base`) is stored on every import/export. For Figma-side changes, we just say "Figma has been modified" — the designer already knows what they did. Full visual diff (using computed styles) is a future enhancement, not needed for MVP.

**Q4: What about whitespace-only or formatting-only changes?**

A: Normalize whitespace before hashing. Specifically: trim trailing whitespace per line, normalize line endings to `\n`, collapse multiple blank lines to one. This prevents false positives from editors/formatters while still catching meaningful structural changes.

**Q5: Should the conflict dialog block, or should the designer be able to continue working?**

A: Non-blocking. The status indicator is always visible. The conflict dialog appears only when the designer explicitly tries to export or import while in conflict state. The designer can continue working in Figma at any time.

---

## Design

### State Model

Each page has an independent sync status, computed from two boolean signals:

| `jayHtmlModified` | `figmaModified` | Status                         |
| :---------------: | :-------------: | :----------------------------- |
|       false       |      false      | **IN_SYNC** (green)            |
|       true        |      false      | **JAY_HTML_MODIFIED** (yellow) |
|       false       |      true       | **FIGMA_MODIFIED** (blue)      |
|       true        |      true       | **CONFLICT** (red)             |

State transitions:

```
                    file change
    IN_SYNC ─────────────────────► JAY_HTML_MODIFIED
       │                                  │
       │ figma change           figma change │
       ▼                                  ▼
 FIGMA_MODIFIED ─────────────────► CONFLICT
                    file change

 Any state ──── import or export ───► IN_SYNC
 CONFLICT ──── export (overwrite) ──► IN_SYNC
 CONFLICT ──── import first ────────► IN_SYNC ── designer edits ──► FIGMA_MODIFIED ── export ──► IN_SYNC
```

### Architecture: Who Tracks What

```
┌─────────────────────────────┐
│ Figma Plugin Sandbox        │
│ (code.ts)                   │
│                             │
│ documentchange listener     │──── figma-modified ────┐
│ → per-section dirty flag    │   (postMessage)        │
└─────────────────────────────┘                        ▼
                                            ┌──────────────────────┐
┌─────────────────────────────┐             │ Plugin UI (iframe)   │
│ Editor Server               │             │                      │
│                             │             │ SyncStatusTracker    │
│ SyncStateManager            │             │ - jayHtmlModified[]  │
│ - file watcher (*.jay-html) │── server ──►│ - figmaModified[]    │
│ - per-page sync hash        │  notification│ - computes status   │
│ - baseline storage          │             │ - updates UI         │
│ - broadcast to clients      │             │ - shows indicators   │
└─────────────────────────────┘             └──────────────────────┘
```

**The plugin UI is the single point of status computation.** It receives signals from both sides (server notifications for jay-html changes, sandbox postMessages for Figma changes) and computes the combined status. This avoids the server needing to know about Figma state.

### Protocol Additions

**1. Server-initiated notifications (new Socket.IO event)**

The editor server currently only responds to requests. Pillar 2 adds a `server-notification` event for server-initiated push:

```typescript
// New event on Socket.IO channel: 'server-notification'
// Direction: server → client (broadcast to all connected sockets)

interface ServerNotification {
  type: string;
  timestamp: number;
}

interface JayHtmlChangedNotification extends ServerNotification {
  type: 'jay-html-changed';
  pageUrl: string;
  contentHash: string;
}

interface ContractChangedNotification extends ServerNotification {
  type: 'contract-changed';
  pageUrl: string;
  addedTags: string[];
  removedTags: string[];
}

type ServerNotificationTypes = JayHtmlChangedNotification | ContractChangedNotification;
```

**2. Sync subscribe message (new request-response)**

When the plugin connects (or reconnects), it sends the last known sync hashes for all pages. The server compares with disk and returns current status:

```typescript
interface SyncSubscribeMessage extends BaseMessage<SyncSubscribeResponse> {
  type: 'sync-subscribe';
  pages: {
    pageUrl: string;
    lastSyncContentHash: string;
  }[];
}

interface SyncSubscribeResponse extends BaseResponse {
  type: 'sync-subscribe';
  pageStatuses: {
    pageUrl: string;
    jayHtmlModified: boolean;
    currentContentHash: string; // empty string if file doesn't exist
  }[];
}
// Edge case: if the plugin sends a hash for a pageUrl whose jay-html
// file doesn't exist on disk (deleted page, stale data), the server
// returns jayHtmlModified: true with an empty currentContentHash.
// The plugin treats a missing file as a change.
```

**3. Sync diff message (new request-response)**

Plugin requests the jay-html diff for a page (used in "View diff" during conflict resolution):

```typescript
interface SyncDiffMessage extends BaseMessage<SyncDiffResponse> {
  type: 'sync-diff';
  pageUrl: string;
}

interface SyncDiffResponse extends BaseResponse {
  type: 'sync-diff';
  diff: string; // unified diff format
  linesAdded: number;
  linesRemoved: number;
}
```

**4. Extensions to existing messages**

```typescript
// ExportMessage: add optional sync hash
interface ExportMessage<TVendorDoc> {
  type: 'export';
  vendorId: string;
  pageUrl: string;
  vendorDoc: TVendorDoc;
  lastSyncContentHash?: string; // NEW
}

// ExportResponse: add divergence info
interface ExportResponse {
  type: 'export';
  success: boolean;
  vendorSourcePath?: string;
  jayHtmlPath?: string;
  contractPath?: string;
  warnings?: string[];
  diskDiverged?: boolean; // NEW
  currentContentHash?: string; // NEW
}

// ImportResponse: add content hash
interface ImportResponse<TVendorDoc> {
  type: 'import';
  success: boolean;
  vendorDoc?: TVendorDoc;
  source?: string;
  warnings?: string[];
  stats?: { nodes: number; bindings: number; variantExpressions: number };
  contentHash?: string; // NEW
}
```

### Server: SyncStateManager

New module in `editor-server` (or `stack-cli` where handlers live). Responsibilities:

1. **File watching**: Watch `*.jay-html` and `*.jay-contract` in the project's pages directory using the existing Vite watcher (reuse, don't duplicate)
2. **Hash tracking**: Maintain `syncHashes: Map<pageUrl, string>` — set on import, export, or sync-subscribe
3. **Change detection**: When a file changes, hash it, compare with stored hash, broadcast `jay-html-changed` if different
4. **Baseline storage**: On every import/export, copy `page.jay-html` to `page.jay-html.base`. Used for diff computation and future Phase 2 hybrid import.
5. **Diff computation**: Read `page.jay-html.base` and current `page.jay-html`, produce unified diff

```typescript
class SyncStateManager {
  private syncHashes = new Map<string, string>();
  private broadcast: (notification: ServerNotificationTypes) => void;

  constructor(
    private projectRoot: string,
    broadcast: (notification: ServerNotificationTypes) => void,
  ) {}

  // Called on import/export success
  recordSync(pageUrl: string, jayHtmlContent: string): void;

  // Called on sync-subscribe
  checkStatus(
    pageUrl: string,
    clientHash: string,
  ): { jayHtmlModified: boolean; currentHash: string };

  // Called on file watcher event
  onFileChanged(filePath: string): void;

  // Called for sync-diff request
  computeDiff(pageUrl: string): { diff: string; linesAdded: number; linesRemoved: number };
}
```

**Hashing**: SHA-256 of normalized content (whitespace-normalized as described in Q4), truncated to 16 hex chars. Matches existing `contentHash` pattern in the Import IR.

**Debouncing**: File watcher events are debounced per-page (300ms) to avoid spamming notifications during multi-line saves or AI edits that write incrementally.

### Server: Broadcast Capability

The `EditorServer` class gains a `broadcast` method:

```typescript
class EditorServer {
  // Existing...

  // NEW: broadcast to all connected sockets
  broadcast(event: string, data: any): void {
    this.io?.emit(event, data);
  }
}
```

This is a one-line addition. The `SyncStateManager` uses it to push `server-notification` events.

### Client: Notification Listener

The `EditorProtocol` interface gains a notification subscription:

```typescript
interface EditorProtocol {
  // Existing methods...

  // NEW
  onNotification(callback: (notification: ServerNotificationTypes) => void): void;
  syncSubscribe(params: SyncSubscribeMessage): Promise<SyncSubscribeResponse>;
  syncDiff(params: SyncDiffMessage): Promise<SyncDiffResponse>;
}
```

The `ConnectionManager` registers a `server-notification` listener on the Socket.IO socket and forwards to callbacks.

### Plugin Sandbox: Figma Change Tracking

In `code.ts`, listen for `documentchange` to track which jay page sections have been modified:

```typescript
const figmaModifiedPages = new Set<string>();

figma.on('documentchange', (event) => {
  for (const change of event.documentChanges) {
    if (change.origin !== 'LOCAL') continue;

    const node = figma.getNodeById(change.id);
    if (!node) continue;

    const jaySection = findAncestorJaySection(node);
    if (!jaySection) continue;

    const urlRoute = jaySection.getPluginData(URL_ROUTE_KEY);
    if (urlRoute && !figmaModifiedPages.has(urlRoute)) {
      figmaModifiedPages.add(urlRoute);
      figma.ui.postMessage({
        type: 'figma-modified',
        pageUrl: urlRoute,
        modified: true,
      });
    }
  }
});

function findAncestorJaySection(node: BaseNode): SectionNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'SECTION' && current.getPluginData(JPAGE_KEY) === 'true') {
      return current as SectionNode;
    }
    current = current.parent;
  }
  return null;
}
```

On successful export, clear the flag:

```typescript
function clearFigmaModified(pageUrl: string) {
  figmaModifiedPages.delete(pageUrl);
  figma.ui.postMessage({
    type: 'figma-modified',
    pageUrl,
    modified: false,
  });
}
```

### Plugin UI: SyncStatusTracker

New module in the UI that combines both signals:

```typescript
type SyncStatus = 'in-sync' | 'jay-html-modified' | 'figma-modified' | 'conflict';

class SyncStatusTracker {
  private jayHtmlModified = new Map<string, boolean>();
  private figmaModified = new Map<string, boolean>();
  private listeners = new Set<(pageUrl: string, status: SyncStatus) => void>();

  getStatus(pageUrl: string): SyncStatus {
    const jay = this.jayHtmlModified.get(pageUrl) ?? false;
    const figma = this.figmaModified.get(pageUrl) ?? false;

    if (jay && figma) return 'conflict';
    if (jay) return 'jay-html-modified';
    if (figma) return 'figma-modified';
    return 'in-sync';
  }

  // Called from server notification handler
  setJayHtmlModified(pageUrl: string, modified: boolean): void;

  // Called from sandbox postMessage handler
  setFigmaModified(pageUrl: string, modified: boolean): void;

  // Called after successful import or export
  clearAll(pageUrl: string): void;

  onChange(listener: (pageUrl: string, status: SyncStatus) => void): () => void;
}
```

### Conflict Resolution Flow

When the designer presses **Export** while status is CONFLICT:

```
1. Plugin sends export with lastSyncContentHash
2. Server returns diskDiverged: true
3. Plugin shows conflict dialog (non-blocking overlay):

   ┌─────────────────────────────────────────────────┐
   │  ⚠️  Conflict: /product                         │
   │                                                  │
   │  Both Figma and jay-html have changed since      │
   │  last sync.                                      │
   │                                                  │
   │  [View jay-html changes]    (expandable diff)    │
   │                                                  │
   │  ┌────────────────────┐  ┌───────────────────┐  │
   │  │ Export              │  │ Import First      │  │
   │  │ (overwrite jay-html)│  │ (then re-export)  │  │
   │  └────────────────────┘  └───────────────────┘  │
   │                                                  │
   │  [Cancel]                                        │
   └─────────────────────────────────────────────────┘
```

**"View jay-html changes"**: Plugin sends `sync-diff` request to server. Server diffs `page.jay-html.base` against current `page.jay-html`. Plugin displays unified diff in a scrollable panel.

**"Export (overwrite)"**: Plugin re-sends export without hash check (or with a `force: true` flag). Server writes jay-html, stores new baseline. Plugin clears both flags. Status → IN_SYNC.

**"Import First"**: Plugin sends import request. Server converts current jay-html → FigmaVendorDocument. Plugin replaces Figma nodes (re-import with replace). Both flags cleared → Status → IN_SYNC. The designer's previous Figma changes are gone (replaced by the import), but the AI's changes are now on canvas. Designer re-applies visual changes (status transitions to FIGMA_MODIFIED), then exports → IN_SYNC.

**"Cancel"**: No action. Status stays CONFLICT. Designer can continue working.

When the designer presses **Import** while status is CONFLICT:

No special handling — import always reads from disk, which has the latest content. After import, both flags are cleared. The designer's unsaved Figma changes for that page are replaced.

A confirmation dialog is shown:

```
   ┌─────────────────────────────────────────────────┐
   │  ⚠️  Import will replace your Figma changes     │
   │                                                  │
   │  You have unsaved Figma modifications on this    │
   │  page. Importing will replace them with the      │
   │  jay-html version from disk.                     │
   │                                                  │
   │  [Import (replace Figma)]    [Cancel]            │
   └─────────────────────────────────────────────────┘
```

### Plugin UI: Status Indicators

In the page list (app structure view), each page row shows a status dot:

- 🟢 **In Sync** — no indicator (clean state is the default, no visual noise)
- 🟡 **Jay-HTML Modified** — yellow dot + "jay-html changed externally" tooltip. Change summary with line counts (e.g., "3 lines added, 1 removed") deferred to P2-3 where the baseline file and diff computation are implemented.
- 🔵 **Figma Modified** — blue dot + "unsaved Figma changes" tooltip
- 🔴 **Conflict** — red dot + "both sides modified" tooltip

When a page has a non-sync status, the import/export buttons for that page reflect the action:

| Status            | Import Button                    | Export Button                    |
| ----------------- | -------------------------------- | -------------------------------- |
| IN_SYNC           | Import                           | Export                           |
| JAY_HTML_MODIFIED | **Import Changes** (highlighted) | Export                           |
| FIGMA_MODIFIED    | Import                           | **Export Changes** (highlighted) |
| CONFLICT          | Import (with replace warning)    | Export (shows conflict dialog)   |

### Baseline File Convention

On every successful import or export, the server writes:

```
pages/{route}/page.jay-html.base
```

This is the same file referenced in the single-writer import-export system design as `page.jay-html.base` — the diff base for Phase 2 hybrid import. One file, one name, two uses: sync diff (this pillar) and hybrid import (future). Building it now means Phase 2 hybrid import can be added later without changing the storage model.

The `.base` file should be gitignored (it's a local sync artifact, not source).

---

## File-Level Change List

### New Files

| File                                                      | Repo            | Purpose                                                           |
| --------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| `packages/jay-stack/editor-protocol/lib/notifications.ts` | jay             | Server notification types, sync-subscribe/sync-diff message types |
| `packages/jay-stack/stack-cli/lib/sync-state-manager.ts`  | jay             | File watching, hash tracking, baseline storage, diff computation  |
| `NewPluginIn/JUI/devServer/src/sync-status-tracker.ts`    | jay-desktop-poc | Combines server + Figma signals, computes per-page status         |

### Modified Files

| File                                                         | Repo            | Change                                                                                                                                              |
| ------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/jay-stack/editor-protocol/lib/protocol.ts`         | jay             | Add optional fields to ExportMessage, ExportResponse, ImportResponse. Add SyncSubscribeMessage/Response, SyncDiffMessage/Response to union types.   |
| `packages/jay-stack/editor-protocol/index.ts`                | jay             | Re-export notification types                                                                                                                        |
| `packages/jay-stack/editor-server/lib/editor-server.ts`      | jay             | Add `broadcast()` method. Add `server-notification` event emission. Add `onSyncSubscribe`, `onSyncDiff` handler registration.                       |
| `packages/jay-stack/editor-client/lib/editor-client.ts`      | jay             | Add `onNotification()`, `syncSubscribe()`, `syncDiff()` methods                                                                                     |
| `packages/jay-stack/editor-client/lib/connection-manager.ts` | jay             | Register `server-notification` Socket.IO listener, forward to callbacks                                                                             |
| `packages/jay-stack/stack-cli/lib/editor-handlers.ts`        | jay             | Integrate SyncStateManager. On import/export success: record sync + write baseline. Register sync-subscribe, sync-diff handlers. Wire file watcher. |
| `packages/jay-stack/stack-cli/lib/server.ts`                 | jay             | Pass broadcast function from editor server to SyncStateManager                                                                                      |
| `NewPluginIn/JayFrameworkPlugin/src/code.ts`                 | jay-desktop-poc | Add `documentchange` listener for Figma modification tracking. Add `figma-modified` postMessage. Clear flag on export.                              |
| `NewPluginIn/JayFrameworkPlugin/src/messaging.ts`            | jay-desktop-poc | Add `figma-modified` message type                                                                                                                   |
| `NewPluginIn/JUI/devServer/src/messaging.ts`                 | jay-desktop-poc | Handle `server-notification` from editor client. Handle `figma-modified` from plugin sandbox.                                                       |
| `NewPluginIn/JUI/devServer/src/editor-client.ts`             | jay-desktop-poc | Subscribe to notifications on connect. Call `syncSubscribe` on connect.                                                                             |
| `NewPluginIn/JUI/devServer/src/pages/page.ts`                | jay-desktop-poc | Add sync status indicators to page list. Add conflict resolution dialog. Wire import/export buttons to status-aware flows.                          |

### Conflict Zone Assessment

Per the master plan's cross-pillar coordination rules:

| File                                 | Also touched by                         | Risk       | Mitigation                                                                                                                                                                |
| ------------------------------------ | --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor-protocol/lib/protocol.ts`    | Pillar 1 (playground), Pillar 3 (agent) | **HIGH**   | Pillar 2 adds sync-specific types to the union. Other pillars add their own types. All additive — extend union, don't modify existing types.                              |
| `editor-server/lib/editor-server.ts` | Pillar 1, Pillar 3                      | **HIGH**   | Pillar 2 adds `broadcast()` + 2 new handler registrations. Other pillars add their own handlers. All additive.                                                            |
| `stack-cli/lib/editor-handlers.ts`   | Pillar 1, Pillar 3                      | **HIGH**   | Pillar 2 integrates SyncStateManager and registers 2 new handlers. Core logic lives in `sync-state-manager.ts` (new file, no conflict). Handler registration is additive. |
| `NewPluginIn/.../code.ts`            | Pillar 3 (AI panel)                     | **MEDIUM** | Pillar 2 adds `documentchange` listener (isolated). Pillar 3 adds AI request handling (isolated). Different concerns, low conflict risk.                                  |
| `NewPluginIn/.../page.ts`            | Pillar 3 (AI panel)                     | **MEDIUM** | Pillar 2 adds status indicators + conflict dialog. Pillar 3 adds AI assistant tab. Both are UI additions to different areas.                                              |

---

## Implementation Plan

### Phase 1: Change Detection (→ Demo P2-1)

**Goal:** Plugin shows real-time sync status for each page.

**Steps:**

1. **Protocol: notification types** — Create `notifications.ts` in editor-protocol. Define `JayHtmlChangedNotification`, `ContractChangedNotification`, `SyncSubscribeMessage/Response`. Add to protocol union types.

2. **Server: broadcast** — Add `broadcast(event, data)` to `EditorServer`. One-line method using `this.io.emit()`.

3. **Server: SyncStateManager** — Create `sync-state-manager.ts` in stack-cli. Implement file watching (hook into existing Vite watcher in dev-server), hash tracking, and jay-html-changed notifications. Debounce at 300ms.

4. **Server: handler wiring** — In `editor-handlers.ts`, instantiate SyncStateManager. Register `sync-subscribe` handler. Wire file change callback to broadcast.

5. **Client: notification listener** — Add `onNotification()` to editor-client. Register `server-notification` Socket.IO listener in connection-manager.

6. **Client: sync-subscribe on connect** — On editor client connection, auto-send `sync-subscribe` with page hashes from SECTION plugin data.

7. **Plugin sandbox: Figma tracking** — Add `documentchange` listener in code.ts. Track `figmaModifiedPages` set. Send `figma-modified` postMessage to UI.

8. **Plugin UI: SyncStatusTracker** — Create `sync-status-tracker.ts`. Combine server notifications + Figma modification signals. Expose `getStatus(pageUrl)`.

9. **Plugin UI: status indicators** — Add colored dots to page list rows. Show tooltips on hover.

**Demo P2-1 exit criteria:**

- [ ] File watcher detects external jay-html changes within 2 seconds
- [ ] Plugin displays correct status: In Sync / Jay-HTML Modified / Figma Modified / Conflict
- [ ] Change detection is per-page
- [ ] Status persists across plugin close/reopen (hash in SECTION plugin data + sync-subscribe on reconnect)
- [ ] No false positives (whitespace normalization)
- [ ] Dev server performance unaffected

### Phase 2: Clean Import and Export (→ Demo P2-2)

**Goal:** Import and export work with change awareness, resetting sync status on success.

**Steps:**

1. **Protocol: extend export/import** — Add `lastSyncContentHash` to ExportMessage. Add `diskDiverged`, `currentContentHash` to ExportResponse. Add `contentHash` to ImportResponse.

2. **Server: sync tracking on import/export** — In export handler: hash current jay-html, compare with `lastSyncContentHash`, set `diskDiverged`. On success: call `syncStateManager.recordSync()`. In import handler: on success, return `contentHash`.

3. **Server: baseline storage** — On import/export success, write `page.jay-html.base` alongside `page.jay-html`.

4. **Plugin: update hash on import/export** — After successful import: store returned `contentHash` on SECTION plugin data as `jay-sync-content-hash`. After successful export: store `currentContentHash`.

5. **Plugin: clear status on success** — After import or export completes successfully, call `syncStatusTracker.clearAll(pageUrl)` and `clearFigmaModified(pageUrl)` in the sandbox.

6. **Plugin: re-import with replace** — Implement the re-import flow from the single-writer design: detect existing SECTION by `urlRoute`, show Replace/Import as New/Cancel dialog, capture position, replace.

**Demo P2-2 exit criteria:**

- [ ] Export writes jay-html and updates sync hash
- [ ] Import reads jay-html and updates Figma page
- [ ] After successful export or import, status returns to In Sync
- [ ] Import handles structural changes (new elements, removed elements, reordered)
- [ ] Import preserves contract bindings through structural changes
- [ ] Works with both page-contract and headless-plugin pages

### Phase 3: Conflict Resolution (→ Demo P2-3)

**Goal:** When both sides are modified, the designer gets actionable resolution options.

**Steps:**

1. **Protocol: sync-diff** — Add `SyncDiffMessage/Response` to protocol. Server reads `page.jay-html.base` and current `page.jay-html`, computes unified diff.

2. **Server: diff computation** — Add `computeDiff(pageUrl)` to SyncStateManager. Use a lightweight diff algorithm (line-based, no external dependency — or use the `diff` npm package if already available).

3. **Plugin UI: conflict dialog on export** — When export returns `diskDiverged: true`, show the conflict dialog with three options: Export (overwrite), Import First, Cancel.

4. **Plugin UI: "View jay-html changes"** — Expandable section in conflict dialog. Calls `syncDiff` and displays the unified diff with syntax-highlighted additions/removals.

5. **Plugin UI: import confirmation** — When importing while in CONFLICT or FIGMA_MODIFIED state, show confirmation: "Import will replace your Figma changes."

6. **Plugin: "Export (overwrite)" flow** — Re-send export without hash (or with force flag). Server writes unconditionally. Status → IN_SYNC.

7. **Plugin: "Import First" flow** — Run import (replace Figma), clear both flags → IN_SYNC. Designer re-applies visual changes → FIGMA_MODIFIED → export → IN_SYNC.

**Demo P2-3 exit criteria:**

- [ ] Conflict dialog appears when both sides modified
- [ ] "Export (overwrite)" works
- [ ] "Import first" works
- [ ] "View diff" shows meaningful summary
- [ ] After resolution, status returns to In Sync
- [ ] No data loss in any resolution path
- [ ] Conflict state is per-page

### Phase 4: Full Designer Workflow (→ Demo P2-4)

**Goal:** End-to-end multi-cycle workflow: AI edit → import → design → export → repeat.

**Steps:**

1. **Robustness testing** — Multiple import-export cycles on a complex page. Verify no accumulated drift. Verify bindings survive all cycles.

2. **New contract tag discovery** — When AI adds new jay-html elements with bindings to tags not yet in the page contract, the import should detect them and the plugin should show them as newly available tags. This relies on the existing import flow returning `stats` with binding counts, plus the contract-changed notification if the AI also updated the contract.

3. **Workflow polish** — Status transitions feel snappy (< 500ms for notification to show). Import/export buttons highlight appropriately. Conflict dialog is clear and non-technical.

4. **Edge cases** — Rapid successive file changes (debouncing works). Plugin disconnects mid-operation (graceful recovery on reconnect via sync-subscribe). Server restart while plugin is connected (reconnect + re-subscribe).

**Demo P2-4 exit criteria:**

- [ ] Full roundtrip: AI edit → import → design adjust → export → browser works
- [ ] Multiple import-export cycles maintain structural integrity
- [ ] New contract tags from AI edits are discovered
- [ ] Designer's style changes persist through the workflow
- [ ] No accumulated drift
- [ ] Workflow feels natural and fast

---

## Examples

### Example 1: Designer Notices AI Edit

```
1. Designer is working in Figma on /product
   Status: 🟢 In Sync

2. AI agent (Cursor) edits page.jay-html — adds a reviews section

3. File watcher detects change (within 2s)
   → server hashes file, doesn't match sync hash
   → broadcasts jay-html-changed for /product

4. Plugin UI receives notification
   Status: 🟡 Jay-HTML Modified

5. Designer sees yellow indicator, clicks "Import Changes"
   → import replaces Figma page with updated jay-html
   → reviews section appears in Figma
   Status: 🟢 In Sync

6. Designer styles the reviews section, then exports
   Status: 🟢 In Sync
```

### Example 2: Conflict — Both Sides Changed

```
1. Status: 🟢 In Sync

2. AI edits jay-html (changes button text to "Buy Now")
   Status: 🟡 Jay-HTML Modified

3. Designer changes button color in Figma
   Status: 🔴 Conflict

4. Designer presses Export
   → server returns diskDiverged: true
   → conflict dialog appears

5. Designer clicks "View jay-html changes"
   → sees diff: button text changed from "Add to Cart" to "Buy Now"

6. Designer clicks "Import First"
   → Figma page replaced with AI's version (button says "Buy Now")
   → both flags cleared
   Status: 🟢 In Sync

7. Designer re-applies the red button color in Figma
   Status: 🔵 Figma Modified

8. Designer exports
   Status: 🟢 In Sync
   → jay-html has "Buy Now" + red button
```

### ❌ Bad: Silently Overwriting AI Changes

```
Designer exports without seeing the conflict indicator
→ AI's structural changes are overwritten
→ Designer doesn't realize until later

This is what happens today. Pillar 2 prevents it.
```

### ✅ Good: Fast Iteration Loop

```
1. Designer asks AI: "add a size selector"
   → File change detected → 🟡 Jay-HTML Modified
2. Designer imports → sizes appear in Figma → 🟢
3. Designer styles the sizes → 🔵 Figma Modified
4. Designer exports → 🟢
5. Designer asks AI: "add color swatches below sizes"
   → 🟡
6. Import → 🟢
7. Style → 🔵 → Export → 🟢
```

Each cycle is: AI → yellow → import → green → design → blue → export → green.

---

## Trade-offs

| Decision                                     | What we gain                                                                                                    | What we give up                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status computed in plugin UI, not server     | Server stays simple (no Figma state). Plugin has all signals locally.                                           | Plugin UI has more logic. But it's the right place — it owns the UI.                                                                                                                   |
| No Figma-side diff (just "modified" boolean) | Avoids expensive serialization-compare. Simple and fast.                                                        | "View diff" only shows jay-html changes, not Figma changes. Acceptable — designer knows what they did in Figma.                                                                        |
| Baseline file on disk (`page.jay-html.base`) | Enables diff view now, Phase 2 hybrid import later. Same file as single-writer design's `.base`.                | One more file per page. Gitignored. Small cost.                                                                                                                                        |
| Whitespace normalization for hash            | No false positives from formatters.                                                                             | Genuine whitespace-only changes are invisible. Acceptable — whitespace rarely matters in jay-html.                                                                                     |
| No three-way merge                           | Much simpler. The conflict dialog gives the designer clear choices: overwrite or sequence (import then export). | No automatic merge of non-conflicting changes. The designer must re-apply Figma changes after "Import First". Acceptable for first users — automatic merge is complex and error-prone. |
| `documentchange` for Figma tracking          | Lightweight, no serialization.                                                                                  | May have false positives (undo back to original state still shows "modified"). Acceptable — re-exporting a page that hasn't actually changed is cheap and harmless.                    |

### Notes

- **`ContractChangedNotification`** is also defined in the single-writer import-export system design (that document's "Contract Change Notification" section). This design log adopts the same shape. Implementation should produce one definition, not two.
- **Error handling**: File watcher failure → log warning, degrade to manual refresh (no status updates until watcher recovers). Corrupt file during hash → treat as changed (safe default). Missing baseline for diff → return an error response with `diff: null` and a message "No baseline available — import or export first to establish one."
- **`broadcast()` sends to all connected sockets.** This is correct for single-designer use (one Figma plugin connected). For future multi-user scenarios, scope notifications to the socket that subscribed to each page. Not needed now — flag for later.

### What We're NOT Building

- **Three-way merge** — Too complex, error-prone, and the use case (designer wants to keep both sides' changes automatically) is rare enough that manual resolution is fine
- **Visual diff** (side-by-side rendered comparison) — Requires Pillar 1's compute styles. Can be added later as an enhancement to the diff view
- **Conflict auto-resolution** — Always show the designer a choice. No silent decisions.
- **Git integration** — The sync-base file is NOT a git mechanism. It's a local sync artifact. Version control is orthogonal.
- **Real-time collaborative editing** — Out of scope per master plan. Import/export is batch-based.
