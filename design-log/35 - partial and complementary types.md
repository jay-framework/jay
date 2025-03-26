# Partial and Complementary Types

Partial type is, give a type `T`, getting a type `P` at which all properties of `T` are set as optional.
Typescript has a built in utility type for partial - `type P = Partial<T>`.

Complementary type is, give a type `T` and a specific incarnation of the partial type `P`, denoted as `P1`,
the complementary type `C` is the subset of `T` with all other properties of `T`, such that
`T === P & C`. Typescript has a built in utility to generate the complementary using `Omit` - `type C = Omit<T, keyof P1>`;

## why do we need it?

With Jay Stack, we split the `ViewState` into `StaticViewState` created by slowly changing rendering, and
`DynamicViewState` created by fast changing and interactive rendering.

Both are partials of the `ViewState`, but setting a value in `StaticViewState` means we delete it from the `jay-html`,
turning it into static, and if this value will repeat in the `DynamicViewState` it will be ignored. We want to capture this
behavior with the type system.

## Infer the partial and complementary as function parameters

What if we want to create a function who accepts two parameters who must complement to a joined type?

The naive way to define it is using

```typescript
function combineValues<P extends Partial<T>, C extends Omit<T, keyof P>>(
  partial: P,
  complement: C,
): T {
  return { ...partial, ...complement } as T;
}
```

However, the above will not work.
First, the original type `T` is not explicitly defined on the function, and those cannot be inferred.
Second, the above does not insure a type cannot have extra properties, which allows to have overlapping properties
or extra properties.

## full solution

Here is a full solution that works

```typescript
// Utility types an error message (instead of never)

// Ensures keys of U are a subset of the keys of T, ensuring no extra keys
type ExactSubset<T, U> = keyof U extends keyof T
  ? U
  : { error: 'Object contains properties not in target type' };

// Ensures the keys of A and the Keys of B do not have any overlap
type DisjointKeys<A, B> = keyof A & keyof B extends never
  ? A
  : { error: 'Overlapping properties detected' };

// The generic example function
function combineValues2<
  T extends object,
  P extends Partial<T>,
  C extends Partial<T> & Omit<T, keyof P>,
>(base: T, partial: ExactSubset<T, P>, complement: ExactSubset<T, C> & DisjointKeys<C, P>) {
  console.log({ ...partial, ...complement });
}

// Example usage
interface Person {
  name: string;
  age: number;
  id: string;
}

const base: Person = { name: 'default', age: 0, id: '0' };
const partialResult = { name: 'Alice' };
const complementResult = { age: 30, id: '12345' };

const result = combineValues2(base, partialResult, complementResult);
console.log(result); // { name: "Alice", age: 30, id: "12345" }

// Test cases with improved errors
// Error: Extra property
const extraPartial = { name: 'Bob', extra: 'oops' };
combineValues2(base, extraPartial, complementResult);
// Error: "Object contains properties not in target type"

// Error: Overlap
const overlapPartial = { name: 'Charlie' };
const overlapComplement = { name: 'Charlie2', age: 40 };
combineValues2(base, overlapPartial, overlapComplement);
// Error: "Overlapping properties detected"

// Error: Missing property
const incompletePartial = { name: 'David' };
const incompleteComplement = { age: 25 };
combineValues2(base, incompletePartial, incompleteComplement);
// Error: Type '...' is not assignable to type 'Person' (missing 'id')
```
