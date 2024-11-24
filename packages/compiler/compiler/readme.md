# Jay Compiler

The Jay Compiler is the core library to build and transform jay HTML files and jay component source files.

The library includes the functionality to

- For Jay HTML files
  - [Parse Jay HTML files](./docs/jay-file.md)
  - Parse Jay HTML expressions
  - Generate Jay HTML definition files (.d.ts)
  - Generate Jay element files (runtime generated for Jay HTML files)
  - Generate Jay element bridge files (running in sandbox environment for secure setup)
- For Component Files
  - Extract component exported types
  - Generate component definition files
  - Generate component bridge files (running in main environment for secure setup)
  - Transform component event handlers and `exec$` APIs by compiler patterns
- Jay JSX files
  - Will support JSX style Jay Components. Not ready for usage.
