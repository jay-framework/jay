# The Jay Project

**Experimental Framework!!**

![Jay head image](./assets/jay-head.gif)

**Experimental Framework!!**

Jay is aiming to solve the design to code challenge. How designers and developers cooperate on a software project. 
**The designer to use any design tool, from which `jay-html` files are generated. The `jay-html` files include the UI as well 
as the contract between design and code, which the developer imports when coding Headless Components**, or 
**The developer creates an Headless Component from which a contract is extracted, loaded into the designer design tool to 
build the UI with**.

# Key Concepts of Jay

* Jay is a contract between design tools and headless components.
* Jay allows the designer, in their design tools, to create the user interface and deploy the application (yes, the designer)
  pending CI flows.
* Jay frees the developer from writing HTML, CSS and JSX. 
* Jay Components are headless components, who can be tested and verified regardless of the UI.
* Jay can generate React applications, reusing all the existing React ecosystem
* Jay can generate Jay native applications, which enables way more aggressive optimizations
* Jay can generate safe 3rd party applications, allowing to incorporate 3rd party components and plugins in isolation, 
  with next to zero performance and DevEx impact.

# Why Jay?

Jay set out to solve the 
[Design handover problem](./design-log/000%20-%20design%20handover%20problem.md).
The solution for the handover problem, introducing a contract, is actually a solution for another problem of 
[Extending user interface with 3rd party components](./design-log/001%20-%203rd%20party%20code%20problem.md).

# Quick intro to Jay

## Jay Contract 

A Jay Contract includes 3 elements
1. The `view state` - data that a headless Jay Component hands over to the view or Jay Element to render
2. The `refs` - named html elements or components in the view (Jay Element) to interact with
3. The `variants` - design variations or states that appear in the contract as booleans or enumerations.

## Jay Element / the view

The jay element is a `jay-html` file is **expected to be generated from design tools** of an extended HTML format. 
**No developers should write HTML / CSS / JSX anymore!**

```html
<html>
  <head>
    <script type="application/yaml-jay">
      data:
        count: number
    </script>
  </head>
  <body>
    <div>
      <button ref="subtracter">-</button>
      <span style="margin: 0 16px">{count}</span>
      <button ref="adder-button">+</button>
    </div>
  </body>
</html>
```

Read more about Jay Elements format in [jay-file.md](packages%2Fcompiler%2Fcompiler%2Fdocs%2Fjay-file.md)

## Jay Component / the headless component

Jay Components are headless component working with the contract TS `.d.ts` files generated from the `jay-html`. 

```typescript
import { render, CounterElementRefs } from './counter.jay-html';
import { createSignal, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    const [count, setCount] = createSignal(initialValue);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adderButton.onclick(() => setCount(count() + 1));

    return {
        render: () => ({ count }),
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
```

Read more about Jay Components in [readme.md](packages%2Fruntime%2Fcomponent%2Freadme.md)

# Contribution

## Development Environment Setup

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

## Development Environment Setup

For IntelliJ IDEA, copy vitest runtime configuration to show console logs in test results:

```shell
cp -r dev-environment/editor-setup/idea .idea/
```

Afterward, delete all the Vitest configurations (Run -> Edit Configurations) and restart IntelliJ.

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
