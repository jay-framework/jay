# Jay Runtime packages

The Jay Runtime are the set of libraries that make jay work.
Those libraries include the basic types, runtime model, state management, component model and security model.

## @jay-framework/component

The Jay Component library defines the methods of constructing a Jay Component.

## @jay-framework/secure

The Jay Secure library is the runtime library supporting the sandbox feature of Jay - running headless Jay Components
in a sandbox, while running the heads, the Jay Element on the main thread.

## @jay-framework/list-compare

The list compare library is an algorithm to compute the mutations needed to update list `A` into list `B`.
It is used for DOM manipulations and JSON Patch computations

## @jay-framework/json-patch

JSON Patch compatible with RFC 6902 from the IETF, with support for **item movement** and **immutable** objects,
[JSON Patch page](https://jsonpatch.com/)

## @jay-framework/serialization

A **stateful serialization** implementation that serializes an **object** into a **diff** to be applied to another
**object** on the other side.

## @jay-framework/reactive

The Reactive module is a minimal reactive core implementation that handles storing data,
reacting to data change and detecting if data has actually changed.

## @jay-framework/runtime

The Jay Runtime library is an efficient dom manipulation library, built to be the output of code generation (`@jay-framework/compiler`).
See the `@jay-framework/compiler` docs for the format of the `jay-html` file that compiles to `@jay-framework/runtime` types.
