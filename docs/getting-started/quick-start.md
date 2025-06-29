# Quick Start Guide

Build your first Jay component in minutes! This guide will walk you through creating a simple counter component that demonstrates the core concepts of Jay.

## Prerequisites

- Node.js 18+ installed
- Basic knowledge of TypeScript
- A code editor (VS Code recommended)

## Step 1: Set Up Your Project

Create a new directory and initialize a new project:

```bash
mkdir my-jay-app
cd my-jay-app
npm init -y
```

Install the necessary Jay dependencies:

```bash
npm install jay-component jay-runtime
npm install --save-dev typescript @types/node
```

Create a `tsconfig.json` file:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

## Step 2: Create Your First Jay-HTML File

Create a file called `counter.jay-html` in your `src` directory:

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        count: number
    </script>
  </head>
  <body>
    <div>
      <button ref="subtracter">-</button>
      <span style="margin: 0 16px">{count}</span>
      <button ref="adder">+</button>
    </div>
  </body>
</html>
```

This Jay-HTML file defines:

- **Data contract**: A `count` property of type `number`
- **UI structure**: Two buttons and a display span
- **References**: Named elements (`subtracter`, `adder`) that your component can interact with

## Step 3: Build Your Component

Create a file called `counter.ts` in your `src` directory:

```typescript
import { render, CounterElementRefs } from './counter.jay-html';
import { createSignal, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
  initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
  const [count, setCount] = createSignal(initialValue);

  refs.subtracter.onclick(() => setCount(count() - 1));
  refs.adder.onclick(() => setCount(count() + 1));

  return {
    render: () => ({ count }),
  };
}

export const Counter = makeJayComponent(render, CounterConstructor);
```

This component:

- **Imports the generated types** from your Jay-HTML file
- **Creates reactive state** using `createSignal`
- **Handles user interactions** by attaching event listeners to the referenced elements
- **Returns the view state** that will be rendered in the UI

## Step 4: Create Your Application

Create a file called `app.ts` in your `src` directory:

```typescript
import { Counter } from './counter';

// Create an instance of your counter component
const counter = Counter({ initialValue: 0 });

// Mount the component to the DOM
counter.mount(document.getElementById('app')!);
```

## Step 5: Create Your HTML Page

Create an `index.html` file in your project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My First Jay App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./dist/app.js"></script>
  </body>
</html>
```

## Step 6: Build and Run

Add a build script to your `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

Build your project:

```bash
npm run build
```

Open `index.html` in your browser, and you should see a working counter!

## What You've Built

Congratulations! You've created your first Jay component. Here's what happened:

1. **Design Contract**: Your Jay-HTML file defined the interface between design and code
2. **Type Safety**: TypeScript automatically generated types from your design
3. **Reactive State**: The component uses signals for fine-grained reactivity
4. **Event Handling**: User interactions are handled through the referenced elements
5. **Separation of Concerns**: UI design is separate from business logic

## Key Concepts Demonstrated

### Jay-HTML Format

- **Data scripts** define the component's view state
- **References** (`ref` attributes) create named elements for interaction
- **Template syntax** (`{count}`) displays reactive data

### Component Architecture

- **Headfull components** include both contract and UI design
- **Type-safe contracts** ensure design and code stay in sync
- **Reactive rendering** updates only what changes

### Event Handling

- **Reference-based interaction** connects UI elements to component logic
- **Type-safe events** with full IntelliSense support

## Next Steps

Now that you have a working component, explore:

- [Jay-HTML Format](./../core/jay-html.md) - Learn more about the extended HTML format
- [Contract Files](./../core/contract-files.md) - Create reusable component contracts
- [State Management](./../advanced/state-management.md) - Master reactive state management
- [Examples](./../examples/basic.md) - See more component patterns

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors about missing types, make sure:

- Your Jay-HTML file is properly formatted
- The file extension is `.jay-html`
- You're importing from the correct generated file

### Build Issues

If the build fails:

- Check that all dependencies are installed
- Verify your `tsconfig.json` configuration
- Ensure all import paths are correct

### Runtime Errors

If the component doesn't work in the browser:

- Check the browser console for errors
- Verify the component is properly mounted
- Ensure all referenced elements exist in the Jay-HTML

---

Ready to build more complex components? Check out the [examples](../examples/basic.md) for patterns like forms, lists, and nested components!
