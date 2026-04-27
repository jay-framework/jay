# Design Log #131 — Multipart File Upload in Actions

## Background

Jay actions (`makeJayAction`, `makeJayStream`) currently accept JSON-only input. The client serializes with `JSON.stringify()`, sets `Content-Type: application/json`, and the server body parser calls `JSON.parse()`. There is no path for binary data.

The AIditor plugin (golf project DL#08) needs to upload screenshots, video frames, and file attachments as part of agent task submissions. Today this is handled by a separate HTTP server on port 8787 — the goal is to eliminate that and route everything through Jay actions.

Related design logs: #63 (server actions), #129 (streaming actions), #130 (plugin routes).

## Problem

An AIditor "submit task" action needs to receive:

- Screenshots (PNG, ~100KB–2MB each)
- Video recordings or frame sequences
- Text metadata (annotations, notes, target selectors)

Binary files can't go through `JSON.stringify()`. The options are base64 encoding (33% size overhead, memory pressure for large files) or proper multipart form handling.

## Design

### Approach: FormData-aware actions

Add multipart/form-data support to the existing action pipeline. Actions opt in by declaring file fields. The framework handles parsing on the server and FormData construction on the client.

### Action Declaration

```typescript
export const submitTask = makeJayAction('aiditor.submitTask')
  .withFiles() // marks this action as accepting files
  .withHandler(async (input: SubmitTaskInput, ...services) => {
    // input.screenshots is JayFile[]
    // input.notes is string (text field)
  });
```

`withFiles()` on the builder sets a flag (`acceptsFiles: true`) on the action definition. No schema needed — the handler's input type declares which fields are files.

### File Type

```typescript
/** A file received by a multipart action */
interface JayFile {
  /** Original filename */
  name: string;
  /** MIME type */
  type: string;
  /** File size in bytes */
  size: number;
  /** Absolute path to the temp file on disk */
  path: string;
}
```

Files are written to disk by the parser (not buffered in memory). The handler receives paths, not buffers. Temp files are cleaned up after the handler returns.

### Client Side

When calling an action marked with `acceptsFiles`, the client caller detects `File` or `Blob` instances in the input and builds `FormData` instead of JSON:

```typescript
// Client build transform produces:
const submitTask = createActionCaller<SubmitTaskInput, Result>('aiditor.submitTask', 'POST', {
  acceptsFiles: true,
});

// When called:
submitTask({
  notes: 'Fix the header alignment',
  screenshots: [file1, file2], // File objects from input or canvas
});
```

The caller:

1. Creates a `FormData` object
2. Appends `File`/`Blob` values as file fields
3. Appends non-file values as a single `_json` field (`JSON.stringify` of the remaining data)
4. Omits `Content-Type` header (browser sets it with boundary)

### Server Side

The body parser middleware (`actionBodyParser` in `action-router.ts`) checks `Content-Type`:

- `application/json` → existing JSON parse path (unchanged)
- `multipart/form-data` → parse with `busboy` (streaming multipart parser, no dependencies beyond Node built-ins since Node 18+)
  - File fields → write to temp dir, produce `JayFile` objects
  - `_json` field → parse as JSON, merge with file fields
  - Result: `req.body = { ...jsonFields, ...fileFields }`

### Stream Actions with Files

`makeJayStream` can also use `.withFiles()`. The input parsing is the same — multipart for the request, NDJSON for the response stream. This is the AIditor's primary use case: upload screenshots, stream agent output back.

## Questions

1. **Q: Why not just base64 encode?**

   A: Screenshots are typically 500KB–2MB. Base64 adds 33% overhead. For video frames (multiple images), this compounds quickly. Multipart streaming writes directly to disk — constant memory regardless of file size.

2. **Q: Why `busboy` and not `multer` or `formidable`?**

   A: `busboy` is the lowest-level streaming parser. `multer` wraps `busboy` with Express middleware conventions we don't need (we have our own middleware). `formidable` is larger. `busboy` has zero dependencies and is battle-tested (used internally by `multer`, `express-fileupload`, etc.). Alternatively, since Node 18+ includes `Blob` and `FormData` natively, we could explore using the built-in `Request` API, but Express doesn't expose it.

3. **Q: Where do temp files go?**

   A: `{buildFolder}/.tmp/actions/` — cleaned up after handler returns. The build folder is already gitignored and cleaned by `yarn clean`.

4. **Q: Does the build transform need changes?**

   A: Yes. The client-side replacement of `makeJayAction` must pass `{ acceptsFiles: true }` to `createActionCaller` when the action uses `.withFiles()`. This is a flag on the action definition that the compiler reads.

5. **Q: What about file size limits?**

   A: Default 10MB per file, configurable via `withFiles({ maxFileSize: ... })`. The parser rejects files exceeding the limit before writing them fully to disk.

## Implementation Plan

### Phase 1: Server-side multipart parsing

**File: `dev-server/lib/action-router.ts`**

1. Update `actionBodyParser()` (lines 213–251):

   - Check `Content-Type` header
   - If `multipart/form-data`: parse with `busboy`
     - File fields → write to `{buildFolder}/.tmp/actions/{requestId}/`
     - `_json` field → parse as JSON
     - Merge into `req.body`
   - If `application/json`: existing path (unchanged)
   - After handler completes: delete temp directory

2. Add `JayFile` type export to `stack-server-runtime`

3. Add cleanup logic: wrap action execution in try/finally that removes the temp dir

### Phase 2: Action builder `withFiles()`

**File: `full-stack-component/lib/jay-action-builder.ts`**

1. Add `withFiles(options?)` method to `JayActionBuilder` and `JayStreamActionBuilder`
2. Sets `acceptsFiles: true` on the action definition
3. Optional: `maxFileSize`, `maxFiles` constraints
4. `JayActionDefinition` and `JayStreamActionDefinition` get `acceptsFiles?: boolean`

### Phase 3: Client-side FormData caller

**File: `stack-client-runtime/lib/action-caller.ts`**

1. Update `createActionCaller` signature to accept `options?: { acceptsFiles?: boolean }`
2. When `acceptsFiles` and input contains `File`/`Blob` values:
   - Build `FormData` with file fields + `_json` field for text data
   - Don't set `Content-Type` (browser auto-sets with boundary)
3. Same for `createStreamCaller`

### Phase 4: Build transform

Update the compiler's client-side action replacement to pass `acceptsFiles` flag through to `createActionCaller`/`createStreamCaller`.

## Key Files

| Purpose                | File                                                        |
| ---------------------- | ----------------------------------------------------------- |
| Body parser middleware | `dev-server/lib/action-router.ts` (lines 213–251)           |
| Action router handler  | `dev-server/lib/action-router.ts` (lines 50–181)            |
| Action builder         | `full-stack-component/lib/jay-action-builder.ts`            |
| Action registry        | `stack-server-runtime/lib/action-registry.ts`               |
| Client action caller   | `stack-client-runtime/lib/action-caller.ts`                 |
| Client stream caller   | `stack-client-runtime/lib/action-caller.ts` (lines 224–342) |
| Build transform        | `compiler/lib/` (action replacement)                        |

## Trade-offs

- **Opt-in via `withFiles()`**: Actions without files remain pure JSON — no parsing overhead, no temp file cleanup. The default path is unchanged.
- **Disk-based temp files**: Avoids buffering large files in memory. Cost: filesystem I/O and cleanup responsibility.
- **`busboy` dependency**: Adds one dependency to the dev server. Alternative: hand-roll multipart parsing (not worth it). `busboy` is ~300 lines, zero deps.
- **`_json` convention**: Text fields ride alongside files in a single `_json` FormData field rather than individual form fields. Simpler parsing — one JSON blob plus N files — and preserves the existing typed input model.

## Verification Criteria

1. Existing JSON-only actions work identically (no regression)
2. An action with `.withFiles()` receives `JayFile[]` with valid temp paths
3. Files are cleaned up after handler returns (success or error)
4. A stream action with `.withFiles()` can receive files and stream output
5. Client correctly switches between JSON and FormData based on `acceptsFiles`
6. Files exceeding size limit are rejected with an ActionError before handler runs

## Implementation Results

### Phase 1: Server-side multipart parsing — completed

- `actionBodyParser()` detects `Content-Type: multipart/form-data` and parses with `busboy`
- Files written to `{buildFolder}/.tmp/actions/{requestId}/` temp directory
- `_json` field parsed and merged with file fields into `req.body`
- Cleanup via `cleanupTempDir()` in action router after handler completes (try/finally pattern)
- Actions without `.withFiles()` reject multipart requests with `FILES_NOT_ACCEPTED` error
- `actionBodyParser` accepts optional `registry` parameter for testing with isolated registries

### Phase 2: Action builder withFiles() — completed

- `JayFile` and `FileUploadOptions` types exported from `@jay-framework/fullstack-component`
- `.withFiles(options?)` added to both `JayActionBuilder` and `JayStreamBuilder`
- `acceptsFiles` and `fileOptions` carried through to `JayActionDefinition` / `JayStreamActionDefinition`
- Registry stores `acceptsFiles` flag on registered actions

### Phase 3: Client-side FormData caller — completed

- `buildFormData()` helper: `File`/`Blob` values become file fields, rest serialized as `_json` field
- `hasFiles()` detects `File`/`Blob` in input (including inside arrays)
- `createActionCaller` and `createStreamCaller` accept `{ acceptsFiles }` option
- When `acceptsFiles` and input has files: omits `Content-Type` header, sends `FormData`
- When no files present: falls through to JSON (even for `acceptsFiles` actions)

### Phase 4: Build transform — completed

- `extractActionFromExpression()` detects `.withFiles()` in builder chain, sets `acceptsFiles` on `ActionMetadata`
- `transformActionImports()` passes `{ acceptsFiles: true }` to generated `createActionCaller`/`createStreamCaller` calls
- Virtual module strategy in `jayStackCompiler()` plugin does the same

### Tests — 16/16 passing (action-router), 28/28 passing (transform)

4 new e2e tests in `dev-server/test/action-router.test.ts`:

- File upload with JayFile — handler receives temp path, reads content, temp cleaned up after
- Reject multipart on non-file actions — 400 FILES_NOT_ACCEPTED
- JSON fallback on file actions — withFiles() actions still accept JSON
- Streaming action with file upload — multipart in, NDJSON out

4 new unit tests in `compiler-jay-stack/test/transform-action-imports.test.ts`:

- Extract withFiles flag from makeJayAction
- Extract withFiles flag from makeJayStream
- Transform withFiles action to createActionCaller with acceptsFiles option
- Transform withFiles stream to createStreamCaller with acceptsFiles option

### Deviations from design

1. **Race condition fix: `Promise.all(pendingWrites)`.** The original design didn't account for busboy's `close` event firing before file write streams finish. Added `pendingWrites` promise array — each file write registers a promise, and `bb.on('close')` waits for `Promise.all(pendingWrites)` before resolving.

2. **`actionBodyParser` accepts `registry` option.** The original design assumed the global `actionRegistry`. Tests need isolated registries, so the body parser accepts an optional `registry` parameter (defaults to global).

3. **`fileOptions` accessed via `(action as any).fileOptions`.** The `RegisteredActionBase` interface only stores `acceptsFiles` (boolean). The `fileOptions` (maxFileSize, maxFiles) are read from the action definition at parse time via the registry entry. Since `RegisteredAction` doesn't expose `fileOptions`, the body parser casts to access it. This could be cleaned up by adding `fileOptions` to the registered type.

### Files changed

| File                                                         | Change                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `full-stack-component/lib/jay-action-builder.ts`             | `JayFile`, `FileUploadOptions` types; `.withFiles()` on both builders; `acceptsFiles`/`fileOptions` on definitions |
| `stack-server-runtime/lib/action-registry.ts`                | `acceptsFiles` on `RegisteredActionBase`; carried in `register()`/`registerStream()`                               |
| `dev-server/lib/action-router.ts`                            | `parseMultipart()` with busboy; `cleanupTempDir()`; multipart detection in body parser; temp cleanup in router     |
| `dev-server/package.json`                                    | Added `busboy` + `@types/busboy` dependencies                                                                      |
| `stack-client-runtime/lib/action-caller.ts`                  | `buildFormData()`, `hasFiles()`; `acceptsFiles` option on both callers                                             |
| `compiler-jay-stack/lib/transform-action-imports.ts`         | `.withFiles()` detection in builder chain; `acceptsFiles` on `ActionMetadata`                                      |
| `compiler-jay-stack/lib/index.ts`                            | `acceptsFiles` in virtual module generation                                                                        |
| `agent-kit-template/plugin/actions-guide.md`                 | Documentation for `.withFiles()`, `JayFile`, `FileUploadOptions`                                                   |
| `examples/jay-stack/fake-shop/src/actions/upload.actions.ts` | Example upload + streaming upload actions                                                                          |
| `examples/jay-stack/fake-shop/src/pages/upload/`             | Example upload page (contract, jay-html, page.ts)                                                                  |
