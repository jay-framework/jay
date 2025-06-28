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
import { createSignal, makeJayComponent, Props } from 'jay-component';

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
import { makeJayStackComponent } from 'jay-fullstack-component';

export const component = makeJayStackComponent<ComponentContract>()
  .withInteractive((props, refs) => {
    const [count, setCount] = createSignal(0);

    refs.add.onclick(() => setCount(count() + 1));
    refs.subtract.onclick(() => setCount(count() - 1));

    return {
      render: () => ({ count }),
    };
  });
```

## Component Structure

### Constructor Function

The constructor function is the heart of your component:

```typescript
function MyComponentConstructor(
  props: Props<MyComponentProps>, 
  refs: MyComponentElementRefs
) {
  // 1. Initialize state
  const [state, setState] = createSignal(initialState);

  // 2. Set up event handlers
  refs.button.onclick(() => handleClick());

  // 3. Return render function
  return {
    render: () => ({ /* view state */ }),
  };
}
```

The constructor function:
* receives props
* receives contexts requested with `makeJayComponent` or `makeJayStackComponent.withClientContexts`
* must return an object with a `render` function
* can also return component API as part of the returned object - functions and events.

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
      coordinate: coordinate
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

Update signals using the setter function:

```typescript
function TodoConstructor(props, refs) {
  const [todos, setTodos] = createSignal([]);
  
  // Simple update
  refs.addButton.onclick(() => {
    const newTodo = { id: uuid(), title: 'New Todo', completed: false };
    setTodos([...todos(), newTodo]);
  });
  
  // Update specific item
  refs.toggleButton.onclick((event) => {
    const todoId = event.target.dataset.id;
    setTodos(todos().map(todo => 
      todo.id === todoId 
        ? { ...todo, completed: !todo.completed }
        : todo
    ));
  });
  
  // Remove item
  refs.deleteButton.onclick((event) => {
    const todoId = event.target.dataset.id;
    setTodos(todos().filter(todo => todo.id !== todoId));
  });
}
```

### Computed Values

Use `createMemo` for derived state:

```typescript
function TodoConstructor(props, refs) {
  const [todos, setTodos] = createSignal([]);
  const [filter, setFilter] = createSignal('all');
  
  // Computed values
  const activeTodos = createMemo(() => 
    todos().filter(todo => !todo.completed)
  );
  
  const completedTodos = createMemo(() => 
    todos().filter(todo => todo.completed)
  );
  
  const filteredTodos = createMemo(() => {
    switch (filter()) {
      case 'active': return activeTodos();
      case 'completed': return completedTodos();
      default: return todos();
    }
  });
  
  const activeCount = createMemo(() => activeTodos().length);
  const completedCount = createMemo(() => completedTodos().length);
}
```

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

### Additional State Management Hooks

Jay provides several additional hooks for state management:

```typescript
import { 
  createSignal, 
  createMemo, 
  createEffect,
  createResource, // incorrect
  createRoot, // incorrect
  onCleanup, // incorrect
  onMount, // incorrect
  untrack, // incorrect
  batch, // incorrect
  createPatchableSignal, // missing
  provideContext, // missing
  provideReactiveContext, // missing
  useReactive // missing  
} from 'jay-component';

function AdvancedComponent(props, refs) {
  // Resource for async data
  const [user, { mutate, refetch }] = createResource(
    () => props.userId,
    fetchUser
  );
  
  // Root for independent reactivity
  const root = createRoot((dispose) => {
    const [count, setCount] = createSignal(0);
    return { count, setCount, dispose };
  });
  
  // Lifecycle hooks
  onMount(() => {
    console.log('Component mounted');
  });
  
  onCleanup(() => {
    console.log('Component cleaning up');
  });
  
  // Batch updates for performance
  refs.batchButton.onclick(() => {
    batch(() => {
      setCount(count() + 1);
      setCount(count() + 1);
      setCount(count() + 1);
    });
  });
  
  // Untrack for non-reactive reads
  const currentCount = untrack(() => count());
}
```

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
import { createEvent } from 'jay-component';

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
import { createEvent } from 'jay-component';

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
      title: title() 
    }),
    onTodoUpdated,
    onTodoDeleted,
  };
}
```

### Handling Child Component Events

Handle events from child components:

```typescript
function TodoListConstructor(props, refs) {
  const [todos, setTodos] = createSignal([]);
  
  // Handle events from child components
  refs.todoItems.onCompletedToggle(({ event: completed, viewState: todo }) => {
    setTodos(todos().map(t => 
      t.id === todo.id ? { ...t, completed } : t
    ));
  });
  
  refs.todoItems.onDelete(({ viewState: todo }) => {
    setTodos(todos().filter(t => t.id !== todo.id));
  });
  
  refs.todoItems.onEdit(({ event: newTitle, viewState: todo }) => {
    setTodos(todos().map(t => 
      t.id === todo.id ? { ...t, title: newTitle } : t
    ));
  });
}
```

## Component Composition

### Using Headfull Child Components

// todo write that using child components is done via the 
// jay-html childComp and importing a headfull component.

### using headless child components

// explain it is only supported with Jay Stack, by importing 
// the child headless component and using it's view state and 
// refs in the jay-html of the parent component

### Context and Communication

Use context for component communication. Contexts are provided using `provideContext` or 
`provideReactiveContext` and accessed through constructor parameters:

// need to add about the declaration in `makeJayComponent` of the context marker

```typescript
import { createJayContext, provideContext } from 'jay-runtime';
import { makeJayComponent } from 'jay-component';

const UserContext = createJayContext<{ user: User; updateUser: (user: User) => void }>();

function ProfileConstructor(props, refs, userContext) {
  refs.editButton.onclick(() => {
    userContext.updateUser({ ...userContext.user, name: 'New Name' });
  });
  
  return {
    render: () => ({ user: userContext.user }),
  };
}

export const Profile = makeJayComponent(render, ProfileConstructor, UserContext);
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
      <Profile user="{user}" />
    </div>
  </body>
</html>
```

And provide context in the parent component:

```typescript
function AppConstructor(props, refs) {
  const [user, setUser] = createSignal(null);
  
  // Provide context to child components
  provideContext(UserContext, {
    user: user(),
    updateUser: setUser,
  });
  
  return {
    render: () => ({ user: user() }),
  };
}
```

// need to explain the difference between `provideContext` and `provideReactiveContext`

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
      const initialTodos = await props.loadTodos?.() || [];
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
      error: error() 
    }),
  };
}
```

## Performance Optimization

### Memoization

Use memoization for expensive computations:

```typescript
function DataGridConstructor(props, refs) {
  const [data, setData] = createSignal([]);
  const [sortBy, setSortBy] = createSignal('name');
  const [filter, setFilter] = createSignal('');
  
  // Memoize expensive operations
  const sortedData = createMemo(() => {
    const sorted = [...data()].sort((a, b) => {
      if (sortBy() === 'name') return a.name.localeCompare(b.name);
      if (sortBy() === 'date') return new Date(a.date) - new Date(b.date);
      return 0;
    });
    return sorted;
  });
  
  const filteredData = createMemo(() => {
    if (!filter()) return sortedData();
    return sortedData().filter(item => 
      item.name.toLowerCase().includes(filter().toLowerCase())
    );
  });
  
  return {
    render: () => ({ data: filteredData() }),
  };
}
```

### Conditional Rendering

Optimize rendering with conditional logic:

```typescript
function ListConstructor(props, refs) {
  const [items, setItems] = createSignal([]);
  const [showDetails, setShowDetails] = createSignal(false);
  
  // Only render details when needed
  const itemsWithDetails = createMemo(() => {
    if (!showDetails()) {
      return items().map(item => ({ id: item.id, title: item.title }));
    }
    return items();
  });
  
  return {
    render: () => ({ 
      items: itemsWithDetails(),
      showDetails: showDetails() 
    }),
  };
}
```

// no need for the best practices section

## Next Steps

Now that you understand component development:

1. **Learn Jay Stack** - Build full-stack components with server-side rendering
2. **Master State Management** - Advanced reactive patterns and state management
3. **Explore Examples** - See real-world component patterns
4. **Build Your App** - Apply these concepts to your own application

---

Ready to build full-stack applications? Check out the [Jay Stack Components](./jay-stack.md) guide! 