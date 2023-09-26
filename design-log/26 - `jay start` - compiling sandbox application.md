# Compiling Sandboxed Application

The challenge we face is to take a single application folder, which consists of (now) of Jay components `.ts` files
and Jay element `.jay.html` files, and build out of it two scripts - one for the main window, and a second one for 
a sandbox environment, like a worker.

The challenge involves a few moving parts -
1. how to identify from which component to start the sandbox? 
2. once starting to sandbox components, the main script has to generate component bridges - how do we track that point in the bundling tree?
3. once starting to sandbox components, the sandbox script has to generate element bridges - how to start the sandbox script indicating the entry point components?

## problem 1 - identifying the components to sandbox

The approach we are taking is to mark sandbox as part of a jay element file imports, such as 
```html
<link rel="import" href="./counter" names="Counter" sandbox="yes"/>
```
where the `sandbox` attribute can give a semantic name for the sandbox, allowing to run multiple components in the same sandbox.
for now, we focus on creating the initial sandbox (one sandbox), but later we can expand the notion to multiple sandboxes.

Once identified a jay element file with a `sandbox` indicator, we generate the element with support for sandboxed child components.
This generation happens with the [`generateRuntimeFile`](../packages/compiler/lib/jay-file/jay-file-compiler.ts#850) 
function, and should return, aside from the generated file, also the 
list of sandboxed child components. 

## problem 2 - bundling component bridges in main script

From this point - the element that indicates inporting sandboxed components, we need to track the import linage as 
we create the bundle. Each component that it's linage has one of the sandboxed components as to be bundled as a component bridge
created using the [`componentBridgeTransformer`](../packages/compiler/lib/ts-file/component-bridge-transformer.ts) typescript transformer.

For the transformer to work, it need to have a list of which components to transform (a list from the previous step) and 
a list of which imports are safe (element imports, again a list from the previous step). Maybe the list of elements should be 
created using file scanning? not sure regarding ordering of the bundling algorithm...

Given this transformer and the previous generation step, the bundler can create the main thread / window script.

## problem 3 - bundling 
Given the element with the `sandbox` imports, we generate the for the same element a sandbox root (`worker-root.ts`) using
[`generateSandboxRootFile`](../packages/compiler/lib/jay-file/jay-file-compiler.ts#...) which 
is the start of the worker bundling process. Following the imports line, we import components as-is and element bridges generated 
using [`generateSandboxRuntimeFile`](../packages/compiler/lib/jay-file/jay-file-compiler.ts#883).

## open question

do we need to scan the files before the bundling process to generate whitelist of jay files / declerative files 
that components are allowed to import? can we derive that during the bundling process itself?

# implementation

The current idea is to implement a `jay start` command
```shell
jay start
```

The `jay start` command will start dev experience which will
1. scan source folder for `.jay.html` files and generate the relevant `.jay.html.d.ts` files, as well as the relevant
   component refs files.
2. create bundles for the main window and the sandbox
3. auto generate a UI application that 
   1. shows a list of components
   2. for each component, a dedicated page with a board showing the component
   3. preferably, a property panel to enter property values for the component

