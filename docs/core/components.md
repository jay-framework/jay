# Component Development

Learn how to build Jay components that implement the contracts defined in your Jay-HTML files or contract files.

## Overview

Jay components are the logic layer that implements the contracts defined in your design files.
Jay components are frontend only, and are used as part of Jay-Stack full stack components as the interactive part.
They handle:

- **State Management** - Reactive state using signals
- **Event Handling** - User interactions through references
- **Data Flow** - Providing view state to the UI
- **Business Logic** - Application-specific functionality

## Component Types

### Headfull Components

Headfull components include both the contract and UI design. They're created using `makeJayComponent` with Jay-HTML files.

```typescript
import { render, CounterElementRefs } from './counter.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface CounterProps {
  initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
  const [count, setCount] = createSignal(initialValue);

  refs.add.onclick(() => setCount(count() + 1));
  refs.subtract.onclick(() => setCount(count() - 1));

  return {
    render: () => ({ count }),
  };
}

export const Counter = makeJayComponent(render, CounterConstructor);
```

### Headless Components

Headless components are jay stack full stack components, define only the contract without UI.
Headless components are defined using the same constructor function as the interactive part of the full stack component.
They're created using `makeJayStackComponent` with contract files.

```typescript
import { ComponentContract } from './component.jay-contract';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';

export const component = makeJayStackComponent<ComponentContract>().withInteractive(
  (props, refs) => {
    const [count, setCount] = createSignal(0);

    refs.add.onclick(() => setCount(count() + 1));
    refs.subtract.onclick(() => setCount(count() - 1));

    return {
      render: () => ({ count }),
    };
  },
);
```

## Component Structure

### Constructor Function

The constructor function is the heart of your component:

```typescript
function MyComponentConstructor(props: Props<MyComponentProps>, refs: MyComponentElementRefs) {
  // 1. Initialize state
  const [state, setState] = createSignal(initialState);

  // 2. Set up event handlers
  refs.button.onclick(() => handleClick());

  // 3. Return render function
  return {
    render: () => ({
      /* view state */
    }),
  };
}
```

The constructor function:

- receives props
- receives contexts requested with `makeJayComponent` or `makeJayStackComponent.withContexts`
- must return an object with a `render` function
- can also return component API as part of the returned object - functions and events.

The constructor function is called once during the lifecycle of a component, and defines
a reactive scope which allows using jay state management and hooks.

### Reactive Scope

Jay components operate within a reactive scope that enables fine-grained reactivity:

- **Props are reactive getters** - They update automatically when parent components change them
- **The render function is a reactive getter** - It re-runs when its dependencies change
- **Signals and other hooks are reactive** - They trigger updates when their values change
- **Constructor function is called once** - But render is called any time its reactive dependencies change

A **reactive dependency** is created when you read a signal getter (e.g., `count()`) or call a reactive function within the render function or effects.

### Props

Props are passed to the component and are reactive:

```typescript
export interface TodoProps {
  initialTodos: TodoItem[];
}

function TodoConstructor({ initialTodos }: Props<TodoProps>, refs) {
  // Props are reactive - they update when parent changes them
  const [todos, setTodos] = createSignal(initialTodos());

  // ...
}
```

Unlike other frameworks, events in Jay are not passed as part of the Props. Instead, they are handled through the component's event system.

### References

References provide access to UI elements for event handling:

```typescript
function FormConstructor(props, refs: FormElementRefs) {
  // Access form elements
  refs.submitButton.onclick(() => handleSubmit());
  refs.emailInput.oninput((event) => setEmail(event.target.value));
  refs.passwordInput.oninput((event) => setPassword(event.target.value));

  // Nested references
  refs.form.username.onfocus(() => clearError());
  refs.modal.close.onclick(() => closeModal());
}
```

### Reference APIs

References provide different APIs depending on whether they reference single elements or collections:

#### Single Element References

For single element references, use the `exec$` function to access the underlying DOM element:

```typescript
function FormConstructor(props, refs: FormElementRefs) {
  // Event handling
  refs.submitButton.onclick(() => handleSubmit());
  refs.emailInput.oninput((event) => setEmail(event.target.value));

  // DOM manipulation using exec$
  refs.emailInput.exec$((element) => {
    element.focus();
    element.select();
  });

  refs.submitButton.exec$((element) => {
    element.disabled = true;
  });

  // Property access using exec$
  refs.emailInput.exec$((element) => {
    const emailValue = element.value;
    console.log('Email value:', emailValue);
  });
}
```

#### Collection References

For collection references (elements under `forEach`), use `find` and `map` functions:

```typescript
function TodoListConstructor(props, refs: TodoListElementRefs) {
  // Find specific element by predicate
  const firstCompletedTodo = refs.todoItems.find((viewState) => viewState.completed);
  if (firstCompletedTodo) {
    firstCompletedTodo.exec$((element) => {
      element.style.backgroundColor = 'green';
    });
  }

  // Map over all elements
  const todoElements = refs.todoItems.map((element, viewState, coordinate) => {
    return {
      id: viewState.id,
      element: element,
      coordinate: coordinate,
    };
  });

  // Event handling for all elements
  refs.todoItems.onclick((event) => {
    console.log('Todo clicked:', event.viewState);
  });
}
```

## State Management

### Creating Signals

Use `createSignal` for reactive state:

```typescript
function CounterConstructor(props, refs) {
  // Basic signal
  const [count, setCount] = createSignal(0);

  // Signal with initial value from props
  const [todos, setTodos] = createSignal(props.initialTodos());

  // Signal with complex initial state
  const [formState, setFormState] = createSignal({
    email: '',
    password: '',
    errors: {},
  });
}
```

### Updating State

For simple scalar signals, use the setter directly:

```typescript
const [count, setCount] = createSignal(0);
refs.increment.onclick(() => setCount(count() + 1));

// Setter also accepts a function that receives the previous value
refs.increment.onclick(() => setCount((prev) => prev + 1));
```

For complex or nested state (objects, arrays), use `createPatchableSignal` with JSON Patch operations from `@jay-framework/json-patch`:

```typescript
import { createPatchableSignal } from '@jay-framework/component';
import { ADD, REPLACE, REMOVE } from '@jay-framework/json-patch';

function TodoConstructor(props, refs) {
  const [todos, setTodos, patchTodos] = createPatchableSignal([]);

  // Add an item
  refs.addButton.onclick(() => {
    patchTodos({
      op: ADD,
      path: [todos().length],
      value: { id: uuid(), title: 'New Todo', completed: false },
    });
  });

  // Update a specific property of an item
  refs.shownTodos.completed.onchange(({ viewState: todo }) => {
    let itemIndex = todos().findIndex((_) => _.id === todo.id);
    patchTodos({ op: REPLACE, path: [itemIndex, 'completed'], value: !todo.completed });
  });

  // Update multiple properties at once
  refs.shownTodos.title.onblur(({ viewState: todo }) => {
    let itemIndex = todos().findIndex((_) => _.id === todo.id);
    patchTodos(
      { op: REPLACE, path: [itemIndex, 'title'], value: todo.editText.trim() },
      { op: REPLACE, path: [itemIndex, 'isEditing'], value: false },
    );
  });

  // Remove an item
  refs.shownTodos.deleteButton.onclick(({ viewState: todo }) => {
    let itemIndex = todos().findIndex((_) => _.id === todo.id);
    patchTodos({ op: REMOVE, path: [itemIndex] });
  });
}
```

The patch function accepts one or more JSON Patch operations (`ADD`, `REPLACE`, `REMOVE`, `MOVE`). Each operation targets a path within the state tree using an array of keys/indices. This approach is preferred over spread operators and `.map()` because:

- It expresses the **intent** of the update (replace this field, add this item) rather than reconstructing the whole state
- It produces minimal immutable updates -- only the affected objects are replaced, parents are shallow-copied, siblings keep referential identity
- It composes well -- multiple operations in a single `patch` call are applied atomically

You can also use the standalone `patch` function from `@jay-framework/json-patch` with regular signals:

```typescript
import { patch, REPLACE } from '@jay-framework/json-patch';

const [filters, setFilters] = createSignal({ priceRange: { min: 0, max: 100 }, category: 'all' });

refs.priceSlider.oninput((event) => {
  setFilters(patch(filters(), [{ op: REPLACE, path: ['priceRange', 'min'], value: event.value }]));
});
```

### Computed Values

Use `createMemo` for derived scalar values:

```typescript
function TodoConstructor(props, refs) {
  const [todos, setTodos] = createSignal([]);
  const [filter, setFilter] = createSignal('all');

  const activeTodos = createMemo(() => todos().filter((todo) => !todo.completed));
  const completedTodos = createMemo(() => todos().filter((todo) => todo.completed));

  const filteredTodos = createMemo(() => {
    switch (filter()) {
      case 'active':
        return activeTodos();
      case 'completed':
        return completedTodos();
      default:
        return todos();
    }
  });

  const activeCount = createMemo(() => activeTodos().length);
  const completedCount = createMemo(() => completedTodos().length);
}
```

### Derived Arrays

Use `createDerivedArray` to efficiently map arrays into view state. It is the reactive equivalent of `Array.map` -- but unlike `createMemo(() => items().map(...))`, it only re-maps items that actually changed, keeping the rest stable.

```typescript
import { createDerivedArray } from '@jay-framework/component';
```

The mapping function re-runs for an item only when:

- The source item changed
- The item's index changed (if `index` signal is read)
- The array length changed (if `length` signal is read)
- Any other signal the mapping function depends on changed

```typescript
function PillarConstructor({ pillarTasks, hasNext, hasPrev }: Props<PillarProps>, refs) {
  const taskData = createDerivedArray(pillarTasks, (item, index, length) => {
    let { id, title, description } = item();
    return {
      id,
      taskProps: {
        title,
        description,
        hasNext: hasNext(),
        hasPrev: hasPrev(),
        isBottom: index() === length() - 1,
        isTop: index() === 0,
      },
    };
  });

  return {
    render: () => ({ taskData }),
  };
}
```

`createDerivedArray` is preferred over `createMemo` with `.map()` for rendering lists because it avoids re-creating every mapped item when only one source item changes. This is important for performance with large lists and for preserving referential stability of unchanged items.

### Effects

Use `createEffect` for side effects. Effects return a shutdown function that is called automatically when:

1. The component unmounts
2. A reactive dependency of the effect changes (shutdown is called first, then the effect re-runs)

```typescript
function FormConstructor(props, refs) {
  const [formData, setFormData] = createSignal({ email: '', password: '' });
  const [errors, setErrors] = createSignal({});

  // Validate form when data changes
  createEffect(() => {
    const data = formData();
    const newErrors = {};

    if (!data.email) newErrors.email = 'Email is required';
    if (!data.password) newErrors.password = 'Password is required';
    else if (data.password.length < 6) newErrors.password = 'Password too short';

    setErrors(newErrors);
  });

  // Save to localStorage when data changes
  createEffect(() => {
    localStorage.setItem('formData', JSON.stringify(formData()));

    // Return cleanup function
    return () => {
      // This runs when the effect is cleaned up
      console.log('Form data effect cleaned up');
    };
  });
}
```

### Hooks Summary

Jay provides the following hooks, all imported from `@jay-framework/component`:

| Hook                     | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `createSignal`           | Reactive state for any value                                  |
| `createMemo`             | Derived scalar values that recompute when dependencies change |
| `createEffect`           | Side effects that re-run when dependencies change             |
| `createPatchableSignal`  | Signal with a `patch` function for complex/nested state       |
| `createDerivedArray`     | Efficient reactive array mapping (reactive `Array.map`)       |
| `createEvent`            | Custom event emitters for component communication             |
| `provideContext`         | Provide static context to child components                    |
| `provideReactiveContext` | Provide reactive context that updates children on change      |
| `useReactive`            | Access reactive context from parent                           |

JSON Patch operations are imported from `@jay-framework/json-patch`:

```typescript
import { ADD, REPLACE, REMOVE, MOVE, patch } from '@jay-framework/json-patch';
```

| Operation | Description                                            |
| --------- | ------------------------------------------------------ |
| `ADD`     | Insert a value at a path (for arrays: splice at index) |
| `REPLACE` | Replace the value at a path                            |
| `REMOVE`  | Remove the value at a path (for arrays: splice out)    |
| `MOVE`    | Move an array element from one index to another        |

#### Patchable Signal with JSON Patch

`createPatchableSignal` combines a signal with the `patch` function for updating nested state:

```typescript
import { createPatchableSignal } from '@jay-framework/component';
import { ADD, REPLACE, REMOVE } from '@jay-framework/json-patch';

function AdvancedComponent(props, refs) {
  const [user, setUser, patchUser] = createPatchableSignal({
    name: '',
    email: '',
    preferences: { theme: 'light', notifications: true },
  });

  refs.updateName.onclick(() => {
    patchUser({ op: REPLACE, path: ['name'], value: 'New Name' });
  });

  refs.updatePreferences.onclick(() => {
    patchUser({ op: REPLACE, path: ['preferences', 'theme'], value: 'dark' });
  });

  return {
    render: () => ({ user: user() }),
  };
}
```

#### Standalone `patch` Function

The `patch` function from `@jay-framework/json-patch` can be used directly with regular signals for one-off immutable updates:

```typescript
import { patch, REPLACE } from '@jay-framework/json-patch';

const [config, setConfig] = createSignal({ display: { columns: 3 }, sort: 'name' });

refs.setColumns.onclick(() => {
  setConfig(patch(config(), [{ op: REPLACE, path: ['display', 'columns'], value: 4 }]));
});
```

`patch` returns the same reference if no values actually changed, avoiding unnecessary reactive updates.

## Event Handling

### Basic Event Handling

Attach event handlers to referenced elements:

```typescript
function ButtonConstructor(props, refs) {
  refs.button.onclick(() => {
    console.log('Button clicked!');
  });

  refs.button.onmouseenter(() => {
    console.log('Mouse entered button');
  });

  refs.button.onmouseleave(() => {
    console.log('Mouse left button');
  });
}
```

### Form Event Handling

Handle form events with proper typing using `createEvent`:

```typescript
import { createEvent } from '@jay-framework/component';

function FormConstructor(props, refs) {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');

  // Create event emitters
  const onSubmit = createEvent();
  const onValidationError = createEvent();

  // Input events
  refs.emailInput.oninput((event) => {
    setEmail((event.target as HTMLInputElement).value);
  });

  refs.passwordInput.oninput((event) => {
    setPassword((event.target as HTMLInputElement).value);
  });

  // Form submission
  refs.submitButton.onclick(async () => {
    try {
      const formData = { email: email(), password: password() };

      // Validate form
      if (!formData.email || !formData.password) {
        onValidationError.emit({ message: 'All fields are required' });
        return;
      }

      // Emit submit event
      onSubmit.emit(formData);
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  });

  // Keyboard events
  refs.emailInput.onkeydown((event) => {
    if (event.key === 'Enter') {
      refs.passwordInput.exec$((element) => element.focus());
    }
  });

  return {
    render: () => ({ email: email(), password: password() }),
    onSubmit,
    onValidationError,
  };
}
```

### Component Events

Components can define and emit custom events using `createEvent`. Events are returned as part of the component's return object:

```typescript
import { createEvent } from '@jay-framework/component';

function TodoItemConstructor(props, refs) {
  const [isEditing, setIsEditing] = createSignal(false);
  const [title, setTitle] = createSignal(props.todo.title);

  // Create event emitters
  const onTodoUpdated = createEvent();
  const onTodoDeleted = createEvent();

  refs.editButton.onclick(() => {
    setIsEditing(true);
  });

  refs.saveButton.onclick(() => {
    setIsEditing(false);
    // Emit custom event
    onTodoUpdated.emit({ id: props.todo.id, title: title() });
  });

  refs.deleteButton.onclick(() => {
    // Emit custom event
    onTodoDeleted.emit({ id: props.todo.id });
  });

  return {
    render: () => ({
      isEditing: isEditing(),
      title: title(),
    }),
    onTodoUpdated,
    onTodoDeleted,
  };
}
```

### Handling Child Component Events

Handle events from child components using `createPatchableSignal` for efficient updates:

```typescript
import { createPatchableSignal } from '@jay-framework/component';
import { REPLACE, REMOVE } from '@jay-framework/json-patch';

function TodoListConstructor(props, refs) {
  const [todos, setTodos, patchTodos] = createPatchableSignal([]);

  refs.todoItems.onCompletedToggle(({ event: completed, viewState: todo }) => {
    let index = todos().findIndex((t) => t.id === todo.id);
    patchTodos({ op: REPLACE, path: [index, 'completed'], value: completed });
  });

  refs.todoItems.onDelete(({ viewState: todo }) => {
    let index = todos().findIndex((t) => t.id === todo.id);
    patchTodos({ op: REMOVE, path: [index] });
  });

  refs.todoItems.onEdit(({ event: newTitle, viewState: todo }) => {
    let index = todos().findIndex((t) => t.id === todo.id);
    patchTodos({ op: REPLACE, path: [index, 'title'], value: newTitle });
  });
}
```

## Component Composition

### Using Headfull Child Components

Child components are used via the Jay-HTML template by importing headfull components and using them as elements:

```html
<html>
  <head>
    <!-- Import the child component -->
    <script type="application/jay-headfull" src="./todo-item" names="TodoItem"></script>
    <script type="application/jay-data">
      data:
        todos: array
    </script>
  </head>
  <body>
    <div>
      <!-- Use the child component in the template -->
      <jay:TodoItem todo="{todo}" forEach="todos" trackBy="id" />
    </div>
  </body>
</html>
```

The parent component provides data to child components indirectly, through the render function
and the jay-html mapping of ViewState to child component props:

```typescript
function TodoListConstructor(props, refs) {
  const [todos, setTodos] = createSignal([]);

  return {
    render: () => ({ todos: todos() }),
  };
}
```

### Using Headless Child Components

Headless child components are only supported with Jay Stack.
You import the child headless component and use its view state and refs in the Jay-HTML of the parent component:

```html
<html>
  <head>
    <!-- Import the headless child component -->
    <script
      type="application/jay-headless"
      contract="./todo-item.jay-contract"
      src="./todo-item"
      name="todoItem"
      key="todoItem"
    ></script>
    <script type="application/jay-data">
      data:
        todos: array
    </script>
  </head>
  <body>
    <div>
      <!-- Use the child component's view state and refs -->
      <div forEach="todos" trackBy="id">
        <span>{todoItem.title}</span>
        <button ref="todoItem.toggle">Toggle</button>
        <button ref="todoItem.delete">Delete</button>
      </div>
    </div>
  </body>
</html>
```

### Instance-Based Headless Components (Inline Templates)

Instance-based headless components use `<jay:contract-name>` tags to create multiple independent instances, each with its own props and inline template. Unlike key-based components (where data merges into the parent's ViewState), instance-based components manage their own ViewState independently.

This pattern is useful for components that are rendered multiple times with different data — e.g., product cards, list items, or widgets.

#### Defining the Component

The component uses `makeJayStackComponent` with `props` and a `slowlyRender` and/or `fastRender` function:

```typescript
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { ProductWidgetContract, ProductWidgetSlowViewState } from './product-widget.jay-contract';

export interface ProductWidgetProps {
  productId: string;
}

export const productWidget = makeJayStackComponent<ProductWidgetContract>()
  .withProps<ProductWidgetProps>()
  .withServices(PRODUCTS_DATABASE_SERVICE)
  .withSlowlyRender(async (props, productsDb) => {
    const product = await productsDb.getProduct(props.productId);
    return phaseOutput<ProductWidgetSlowViewState, { productId: string }>(
      { name: product.name, price: product.price, sku: product.sku },
      { productId: product.id },
    );
  })
  .withFastRender(async (props, carryForward, productsDb, inventoryService) => {
    const inStock = await inventoryService.isInStock(carryForward.productId);
    return Pipeline.ok({}).toPhaseOutput(() => ({
      viewState: { inStock },
      carryForward,
    }));
  })
  .withInteractive((props, refs, fastViewState, carryForward) => {
    refs.addToCart.onclick(() => {
      console.log(`Adding ${carryForward.productId} to cart`);
    });
    return { render: () => ({ inStock: fastViewState.inStock[0] }) };
  });
```

#### Using Instances in Jay-HTML

Import the component without a `key`, then use `<jay:contract-name>` tags:

```html
<html>
  <head>
    <script
      type="application/jay-headless"
      plugin="product-widget"
      contract="product-widget"
    ></script>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
  </head>
  <body>
    <!-- Static instances with fixed props -->
    <jay:product-widget productId="1">
      <h3>{name}</h3>
      <div>Price: ${price}</div>
      <button ref="addToCart">Add to Cart</button>
    </jay:product-widget>

    <!-- Instances inside slowForEach (one per array item) -->
    <div forEach="featuredProducts" trackBy="_id">
      <jay:product-widget productId="{_id}">
        <h3>{name}</h3>
        <div>Price: ${price}</div>
        <button ref="addToCart">Add to Cart</button>
      </jay:product-widget>
    </div>
  </body>
</html>
```

**Key points:**

- Props are passed as attributes on the `<jay:xxx>` tag
- The inline template bindings (`{name}`, `{price}`) resolve against the **headless component's ViewState**, not the page's
- Each instance runs its own slow/fast/interactive pipeline independently
- Instances inside `forEach` must use a slow-phase array (the array's `phase` must be `slow` in the contract)

#### Contract for Instance Components

The component's contract defines which fields are available in each phase:

```yaml
name: ProductWidget
props:
  - name: productId
    type: string
    required: true
tags:
  - tag: name
    type: data
    dataType: string
    phase: slow

  - tag: price
    type: data
    dataType: number
    phase: slow

  - tag: in-stock
    type: variant
    dataType: boolean
    phase: fast+interactive

  - tag: add-to-cart
    type: interactive
    elementType: HTMLButtonElement
```

Tags with `phase: slow` are resolved at build time (or request time for slowForEach). Tags with `phase: fast+interactive` are resolved at request time. Interactive-only tags (buttons, inputs) don't need an explicit phase — they default to `fast+interactive`.

### Using Plugin Headless Components

You can use headless components from npm plugins. For dynamic contracts (generated at build time), use the `plugin` and `contract` attributes:

```html
<html>
  <head>
    <!-- Import a dynamic contract component from a plugin -->
    <script
      type="application/jay-headless"
      plugin="@jay-framework/wix-data"
      contract="list/recipes-list"
      key="recipes"
    ></script>
  </head>
  <body>
    <div>
      <h1>Recipes</h1>
      <ul>
        <li forEach="recipes.items" trackBy="_id">
          <a ref="recipes.items.itemLink">{recipes.items.title}</a>
        </li>
      </ul>
    </div>
  </body>
</html>
```

The plugin component receives metadata via `DynamicContractProps`:

```typescript
import { makeJayStackComponent, DynamicContractProps } from '@jay-framework/fullstack-component';

interface WixDataMetadata {
  collectionId: string;
}

export const collectionList = makeJayStackComponent<ListViewState>()
  .withProps<PageProps & DynamicContractProps<WixDataMetadata>>()
  .withServices(WIX_DATA_SERVICE)
  .withSlowlyRender(async (props, wixData) => {
    // Metadata from the generator is available via props.metadata
    const { collectionId } = props.metadata!;
    const items = await wixData.query(collectionId).find();
    // ...
  });
```

See [Building Jay Packages](./building-jay-packages.md#dynamic-contracts) for more on creating dynamic contract generators.

### Context and Communication

Use context for component communication. Contexts are provided using `provideContext` or
`provideReactiveContext` and accessed through constructor parameters. You must declare context markers in the `makeJayComponent` call:

```typescript
import { createJayContext, provideContext, provideReactiveContext } from '@jay-framework/runtime';
import { makeJayComponent } from '@jay-framework/component';

const UserContext = createJayContext<{ user: User; updateUser: (user: User) => void }>();
const ThemeContext = createJayContext<{ theme: string; toggleTheme: () => void }>();

function ProfileConstructor(props, refs, userContext, themeContext) {
  refs.editButton.onclick(() => {
    userContext.updateUser({ ...userContext.user, name: 'New Name' });
  });

  refs.themeToggle.onclick(() => {
    themeContext.toggleTheme();
  });

  return {
    render: () => ({
      user: userContext.user,
      theme: themeContext.theme,
    }),
  };
}

// Declare context markers in makeJayComponent
export const Profile = makeJayComponent(render, ProfileConstructor, UserContext, ThemeContext);
```

Then use the Profile component in your Jay-HTML:

```html
<html>
  <head>
    <script type="application/jay-headfull" src="./profile" names="Profile"></script>
    <script type="application/jay-data">
      data:
        user: object
    </script>
  </head>
  <body>
    <div>
      <jay:Profile user="{user}" />
    </div>
  </body>
</html>
```

And provide context in the parent component:

```typescript
function AppConstructor(props, refs) {
  const [user, setUser] = createSignal(null);
  const [theme, setTheme] = createSignal('light');

  // Provide static context (doesn't update when context changes)
  provideContext(UserContext, {
    user: user(),
    updateUser: setUser,
  });

  // Provide reactive context (updates when dependencies change)
  provideReactiveContext(ThemeContext, () => ({
    theme: theme(),
    toggleTheme: () => setTheme(theme() === 'light' ? 'dark' : 'light'),
  }));

  return {
    render: () => ({ user: user(), theme: theme() }),
  };
}
```

### Context Types

**`provideContext`** provides a static context value that doesn't trigger updates when the context changes. This is useful for dependency injection and values that don't change often.

**`provideReactiveContext`** provides a reactive context that automatically updates child components when the context's reactive dependencies change. This is useful for values that change frequently and should trigger re-renders.

### Global Reactive Contexts

For app-wide contexts that need to be available to all components without a parent provider, use `registerReactiveGlobalContext` in your initialization:

```typescript
import { createJayContext } from '@jay-framework/runtime';
import { createSignal, registerReactiveGlobalContext } from '@jay-framework/component';
import { makeJayInit } from '@jay-framework/fullstack-component';

// Define the context
interface AppConfigContext {
  theme: () => 'light' | 'dark';
  toggleTheme: () => void;
}
export const APP_CONFIG_CTX = createJayContext<AppConfigContext>();

// Register in init
export const init = makeJayInit().withClient(() => {
  registerReactiveGlobalContext(APP_CONFIG_CTX, () => {
    const [theme, setTheme] = createSignal<'light' | 'dark'>('light');
    return {
      theme,
      toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    };
  });
});
```

Components can then access this context anywhere in the app:

```typescript
function MyComponent(props, refs) {
  const appConfig = useContext(APP_CONFIG_CTX);

  refs.themeToggle.onclick(() => appConfig.toggleTheme());

  return {
    render: () => ({ theme: appConfig.theme() }),
  };
}
```

**When to use each:**

| Context Type                    | Use Case                                     |
| ------------------------------- | -------------------------------------------- |
| `provideContext`                | Static values, dependency injection          |
| `provideReactiveContext`        | Reactive values scoped to component subtree  |
| `registerReactiveGlobalContext` | Reactive values available app-wide (in init) |

## Component Lifecycle

### Initialization and Cleanup

Components can perform initialization and cleanup using effects:

```typescript
function TodoConstructor(props, refs) {
  const [todos, setTodos] = createSignal([]);
  const [isLoading, setIsLoading] = createSignal(true);

  // Initialize component
  createEffect(async () => {
    try {
      setIsLoading(true);
      const initialTodos = (await props.loadTodos?.()) || [];
      setTodos(initialTodos);
    } catch (error) {
      console.error('Failed to load todos:', error);
    } finally {
      setIsLoading(false);
    }
  });

  // Cleanup on unmount
  createEffect(() => {
    return () => {
      // Cleanup logic here
      console.log('Component unmounting');
    };
  });

  return {
    render: () => ({ todos: todos(), isLoading: isLoading() }),
  };
}
```

### Resource Management

Manage resources properly with cleanup functions:

```typescript
function TimerConstructor(props, refs) {
  const [time, setTime] = createSignal(0);
  let intervalId: number;

  // Start timer
  refs.startButton.onclick(() => {
    intervalId = setInterval(() => {
      setTime(time() + 1);
    }, 1000);
  });

  // Stop timer
  refs.stopButton.onclick(() => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = 0;
    }
  });

  // Cleanup on unmount
  createEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  });

  return {
    render: () => ({ time: time() }),
  };
}
```

## Error Handling

### Try-Catch in Event Handlers

Handle errors in event handlers:

```typescript
function FormConstructor(props, refs) {
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  refs.submitButton.onclick(async () => {
    try {
      setIsSubmitting(true);
      setError('');

      // Handle form submission
      const formData = { email: email(), password: password() };
      await submitForm(formData);

      // Success handling
      console.log('Form submitted successfully');
    } catch (error) {
      // Error handling
      setError(error.message);
      console.error('Form submission failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  });

  return {
    render: () => ({
      isSubmitting: isSubmitting(),
      error: error(),
    }),
  };
}
```

## Performance Optimization

### Use `createDerivedArray` for List Mapping

When mapping arrays to view state, prefer `createDerivedArray` over `createMemo` with `.map()`. The derived array only re-maps items that actually changed:

```typescript
import { createDerivedArray, createSignal, createMemo } from '@jay-framework/component';

function DataGridConstructor(props, refs) {
  const [data, setData] = createSignal([]);
  const [selectedId, setSelectedId] = createSignal(null);

  // createDerivedArray: only re-maps rows whose data changed or whose selection state changed
  const rows = createDerivedArray(data, (item) => {
    const { id, name, date } = item();
    return {
      id,
      name,
      date,
      isSelected: id === selectedId(),
    };
  });

  refs.rows.onclick(({ viewState }) => setSelectedId(viewState.id));

  return {
    render: () => ({ rows }),
  };
}
```

### Use `createMemo` for Scalar Derived Values

`createMemo` is the right choice for scalar values derived from reactive state:

```typescript
const activeCount = createMemo(() => todos().filter((t) => !t.completed).length);
const hasCompleted = createMemo(() => todos().some((t) => t.completed));
```

### Targeted Updates with `patch`

Use JSON Patch operations to update only the specific fields that changed, rather than reconstructing entire objects or arrays:

```typescript
import { createPatchableSignal } from '@jay-framework/component';
import { REPLACE } from '@jay-framework/json-patch';

function GridConstructor(props, refs) {
  const [rows, setRows, patchRows] = createPatchableSignal(props.initialRows());

  // Only replace the changed cell, not the entire row or array
  refs.cells.oninput(({ viewState: cell, event }) => {
    patchRows({ op: REPLACE, path: [cell.rowIndex, 'value'], value: event.target.value });
  });
}
```

## Next Steps

Now that you understand component development:

1. **Learn Jay Stack** - Build full-stack components with server-side rendering
2. **Master State Management** - Advanced reactive patterns and state management
3. **Explore Examples** - See real-world component patterns
4. **Build Your App** - Apply these concepts to your own application

---

Ready to build full-stack applications? Check out the [Jay Stack Components](./jay-stack.md) guide!
