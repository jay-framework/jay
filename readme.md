# The Jay Project

The Jay Project started as an attempt of solving the handover from designers to developers with a new take on an old approach -
**designer to use any design tool, export the design to the developer, which is then using the design as part of the code project**.
It has evolved into solving another problem of **building a user interface using 3rd party components while preventing cross site scripting**.

## Design handover problem

Learning from other project, we know that code generation is great for one way export, but fails on re-export. like any
development process, the work a designer does is never one off, but an iterative process at which the designer makes some design,
the developer builds some part of the application, then due to feedback (dev feedback, QA, product, early adopters, etc) the designer
updates the design, then the developer re-implements the design, etc.

![iterative design and feedback](design-log/Into%20to%20Jay%201.png 'iterative design and feedback')

Because there is no good tool for design export and re-export, we find that today, the way designers and developers are working
is by the **designer designing and the developer _re-implementing_ the design** using code tools. The designer will export design
assets using tools like Adobe XP or photoshop, which are CSS snippets, image snippets, SVGs, etc. The developer, using those
design assets, will build the UI using tools like JSX, SSAS, etc.

![Comparing Jay with known workflow](design-log/Into%20to%20Jay%202.png 'Comparing Jay with known workflow')

Jay approach is to create a **declerative format** that can be generated from design tools, and used directly by the code.
As the designer continues to update the design, the developer code who is using the design should inherit the update automatically.
Only if the contract between design and code changes, the developer will need to update the code - and should see type safe validations
that represent that contract change.

The next question is which format should the Jay file take? To answer that question we need to formulate the requirements from the Jay File -

1. should be declarative that a design tool can generate
2. should support any existing HTML / CSS capability
3. should support any future HTML / CSS capability

When examining this question and requirements, there is only one potential format that meets all of those - and that is HTML / CSS.

## Extending user interface with 3rd party components

The problem of extending user interfaces with 3rd party components is quite common - and has one known resolution.
Consider any kind of dashboard or website that needs to include components from a 3rd party while ensuring the 3rd party
does not have access to the host cookies, assets or REST APIs. The standard tool on the web is using **IFrames**, which
solves the problem using multiple domains, and the browser security model.

However, IFrames have a host of problems - from loading times to limited flexibility - no simple solution to overflow the IFrame boundaries
for things like modal dialogs. IFrames are not built for many small frames - consider a table at which each cell should be an IFrame...
or consider compositions of component in component...

![IFrame vs Jay security model](design-log/Into%20to%20Jay%203.png 'IFrame vs Jay security model')

Jay as a potential of solving this problem by introducing two new concepts - **Jay Element** and **Jay Component**.
**Jay Element** is what the Jay File contains, and what the developer imports. Because it is logic free, it is safe to
run on the main window. **Jay Component** is the code the developer writes that imports the Jay Element. It is unsafe as it includes
3rd party code - and those has to run inside an IFrame. However, Jay can run the **all Jay Components in a single IFrame** while supporting
multiple components on the page, including component in component and such.

## Contribution

### Development Environment Setup

Install Node version from [./.nvmrc]. Recommended to use [nvm](https://github.com/nvm-sh/nvm).

```shell
# setup yarn
npm i -g npm # making sure you're using newest npm
npm i -g corepack
corepack enable
yarn set version 3.6.4
npm run reinstall

yarn run build
```

Mark `.yarn` directory as excluded in IntelliJ.

### Development Environment Setup

For IntelliJ IDEA, copy vitest runtime configuration to show console logs in test results:

```shell
cp -r dev-environment/editor-setup/idea .idea/
```

During development, it's convenient to watch for changes.
You can run the following command from root to watch for all the packages,
or run it from the specific package.

```shell
yarn build:watch
```

### Running commands from packages

If you get errors of some dependency not found when running commands from packages, try running them with yarn:

```bash
yarn run build # for commands
```

### Creating a pull request

Before creating a pull request, make sure that all the code compilers and tests pass.
There is a single command to do it for all the packages.
Run it from jay project root:

```bash
yarn confirm
```
