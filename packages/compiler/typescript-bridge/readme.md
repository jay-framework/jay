# @jay-framework/typescript-bridge

A TypeScript CommonJS to ESM bridge that provides seamless access to TypeScript utilities without ESM/CommonJS compatibility issues.

## Installation

```bash
npm install @jay-framework/typescript-bridge
```

## Usage

### Default Import (Recommended)

```typescript
import tsBridge from '@jay-framework/typescript-bridge';

// Decompose into individual functions
const { isIdentifier, isStatement, isBinaryExpression, visitEachChild, SyntaxKind } = tsBridge;

// Use as normal
if (isIdentifier(node)) {
  console.log(node.text);
}
```

### Named Imports

```typescript
import { tsBridge, ts, getTs } from '@jay-framework/typescript-bridge';

// Use the proxy directly
tsBridge.isIdentifier(node);

// Access the full TypeScript module
ts.visitEachChild(node, visitor, context);

// Get utilities dynamically
const isIdentifier = getTs('isIdentifier');
isIdentifier(node);
```

### Type Imports

```typescript
import type { TypeScript as ts } from '@jay-framework/typescript-bridge';

function processNode(node: ts.Node): void {
  // Type-safe TypeScript usage
}
```

## Benefits

- **No ESM/CommonJS issues**: Handles the compatibility problems automatically
- **Type-safe**: Full TypeScript intellisense and type checking
- **Flexible**: Multiple import patterns to suit your needs
- **Lightweight**: Minimal overhead, direct access to TypeScript utilities
- **Maintainable**: No need to list all utilities explicitly

## API

### `tsBridge` (default export)

A proxy object that provides access to all TypeScript utilities.

### `ts`

The full TypeScript module for direct access.

### `getTs(utilName)`

A function that returns any TypeScript utility by name.

### `TypeScript` (type)

TypeScript types for type annotations.
