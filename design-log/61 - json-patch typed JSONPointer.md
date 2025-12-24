# JSON Patch Typed JSONPointer

## Problem

The `json-patch` package lacked type safety for JSONPointer paths. When writing a JSON patch operation, there was no autocomplete or type checking on the `path` property, making it easy to specify invalid paths that don't exist on the target object.

```typescript
// Before: No type safety - any path accepted
const patch: JSONPatch = [
    { op: 'replace', path: ['nonexistent', 'path'], value: 5 }  // No error!
];
```

## Solution

Added a `Paths<T>` utility type that generates all valid path tuples for a given type `T`, then used it in `JSONPointer<T>` to provide type-safe path completion.

### Type Implementation

```typescript
// Depth counter for recursion limit (supports up to depth 7)
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, ...0[]];

// Generate all valid paths as tuple types
type Paths<T, Depth extends number = 7> = Depth extends 0
    ? never
    : T extends object
        ? {
            [K in keyof T]: K extends string | number
                ? T[K] extends any[]
                    ?
                    | [K]
                    | [K, number]
                    | (T[K][number] extends object
                    ? [K, number, ...Paths<T[K][number], Prev[Depth]>]
                    : never)
                    : T[K] extends object
                        ? [K] | [K, ...Paths<T[K], Prev[Depth]>]
                        : [K]
                : never;
        }[keyof T]
        : never;

// Handle any/unknown fallback gracefully
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsUnknown<T> = unknown extends T ? (T extends unknown ? true : false) : false;

export type JSONPointer<T = unknown> = IsAny<T> extends true
    ? (string | number)[]
    : IsUnknown<T> extends true
        ? (string | number)[]
        : [T] extends [never]
            ? (string | number)[]
            : Paths<T> extends never
                ? (string | number)[]
                : Paths<T>;
```

### Usage

```typescript
interface Product {
    id: string;
    details: {
        name: string;
        price: number;
    };
    tags: string[];
}

// Now with type completion!
const patch: JSONPatch<Product> = [
    { op: 'replace', path: ['details', 'name'], value: 'New Name' },  // ✅ Valid
    { op: 'replace', path: ['tags', 0], value: 'sale' },              // ✅ Valid
    { op: 'replace', path: ['details', 'invalid'], value: 5 }         // ❌ Type error!
];
```

## Key Design Decisions

### 1. Graceful Fallback for Dynamic Types

When `T` is `any`, `unknown`, or `never`, the type falls back to `(string | number)[]` to allow dynamic path construction. This ensures the internal implementation (which needs to work with runtime-constructed paths) can still function.

### 2. Default Type Parameter

All patch types (`JSONPatch`, `JSONPatchAdd`, `JSONPatchReplace`, etc.) now default to `unknown`, allowing untyped usage when type safety isn't needed:

```typescript
// Typed usage - full path completion
const typedPatch: JSONPatch<MyType> = [...];

// Untyped usage - allows any paths
const untypedPatch: JSONPatch = [...];
```

### 3. Depth Limiting

Path generation uses a depth counter (`Prev` type) to prevent infinite recursion on deeply nested or recursive types. The default depth of 7 handles most practical cases while keeping type computation fast.

## Files Changed

- `lib/json-patch-contract.ts` - Added `Paths<T>`, `IsAny<T>`, `IsUnknown<T>` types; updated `JSONPointer<T>` and all patch interfaces to use default type parameters
- `lib/deserialize/patch.ts` - Updated `patch<T>()` function to accept `JSONPatch<T>` so paths are type-checked against the target type; uses `any` internally for dynamic property access
- `test/patch.test.ts` - Updated tests: use `Record<string, T>` for tests adding new properties; use `as any` for tests that intentionally test invalid paths

## Benefits

1. **Type Completion**: IDE autocomplete shows valid paths when writing patches
2. **Type Safety**: Invalid paths are caught at compile time
3. **Backward Compatible**: Untyped usage (`JSONPatch`) still works for dynamic scenarios
4. **Self-Documenting**: The type signature shows exactly what paths are valid

## Limitations

- Recursive types may hit the depth limit (default 7 levels)
- Very large types may slow down TypeScript compilation
- Index signatures (`Record<string, T>`) expand to allow any string key
