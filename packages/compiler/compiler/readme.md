# Jay Compiler

The Jay Compiler is the core library to build and transform jay HTML files and jay component source files.

The library includes the functionality to

- For Jay HTML files
  - [Parse Jay HTML files](./docs/jay-file.md)
  - [Parse Jay HTML expressions](./docs/jay-file.md#the--binding)
  - Generate Jay HTML definition files (.d.ts)
  - Generate Jay element files (runtime generated for Jay HTML files)
  - Generate Jay element bridge files (running in sandbox environment for secure setup)
- Compiler Patterns
  - [Compile Compiler Patterns](./docs/compiler-patterns.md)
- For Component Files
  - Extract component exported types
  - Generate component definition files
  - Generate component bridge files (running in main environment for secure setup)
  - Transform component event handlers and `exec$` APIs by compiler patterns
- Jay JSX files
  - Will support JSX style Jay Components. Not ready for usage.

## package structure

The main folders in the compiler package are:

- [components-files](lib%2Fcomponents-files) - contains the typescript generators and transformers for component files
  - [basic-analyzers](lib%2Fcomponents-files%2Fbasic-analyzers) - low level analyzers to detect what is an identifier,
    pattern matching on AST, etc.
  - [building-blocks](lib%2Fcomponents-files%2Fbuilding-blocks) - building blocks for type script component file transformations
- [jay-html-files](lib%2Fjay-html-files) - contains the jay-html file parsing and code generators
- [expressions](lib%2Fexpressions) - contains the expressions parse used by jay-html files bindings
- [analyze-exported-types](lib%2Fanalyze-exported-types) - analyzes exported types for component files
