# Jay Compiler

The Jay Compiler is the core library to build and transform jay HTML files and jay component source files.

The library includes the functionality to

- For Jay HTML files
  - [Parse Jay HTML files](../compiler-jay-html/readme.md)
  - [Parse Jay HTML expressions](../compiler-jay-html/readme.md#the--binding)
  - Generate Jay HTML definition files (.d.ts)
  - Generate Jay element files (runtime generated for Jay HTML files)
  - Generate Jay element bridge files (running in sandbox environment for secure setup)
- Compiler Patterns
  - [Compile Compiler Patterns](../compiler-jay-html/docs/compiler-patterns.md)
- For Component Files
  - Extract component exported types
  - Generate component definition files
  - Generate component bridge files (running in main environment for secure setup)
  - Transform component event handlers and `exec$` APIs by compiler patterns
- Jay JSX files
  - Will support JSX style Jay Components. Not ready for usage.

## Compile Target

The compiler supports two compile targets - `Jay` and `React` (default `Jay`).
The compile target only impacts how Jay Elements are generated, not including the `.d.ts` element files.

See examples of `Jay` compile targets at [jay](..%2F..%2F..%2Fexamples%2Fjay),
and examples of `React` compile target at [@jay-framework/4-react](..%2F..%2F..%2Fexamples%2F4-react).

## package structure

The main folders in the compiler package are:

- [components-files](lib/components-files) - contains the typescript generators and transformers for component files
  - [basic-analyzers](lib/components-files/basic-analyzers) - low level analyzers to detect what is an identifier,
    pattern matching on AST, etc.
  - [building-blocks](lib/components-files/building-blocks) - building blocks for type script component file transformations
- [jay-html-files](../compiler-jay-html) - contains the jay-html file parsing and code generators
- [expressions](../compiler-jay-html/lib/expressions) - contains the expressions parse used by jay-html files bindings
- [analyze-exported-types](../compiler-analyze-exported-types) - analyzes exported types for component files
