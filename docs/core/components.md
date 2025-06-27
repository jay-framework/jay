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

The constructor function
* receives props
* receives contexts requested with `makeJayComponent` or `makeJayStackComponent.withClientContexts`
* must return an object with a `render` function
* can also return component API as part of the returned object - functions and events.

The constructor function is called once during the lifecycle of a component, and defines
a reactive scope which allows using jay state management and hooks.

### Props

Props are passed to the component and are reactive:

```typescript
export interface TodoProps {
  initialTodos: TodoItem[];
}

function TodoConstructor({ initialTodos, onComplete }: Props<TodoProps>, refs) {
  // Props are reactive - they update when parent changes them
  const [todos, setTodos] = createSignal(initialTodos());
  
  // ...
}
```

Unlike other frameworks, events in Jay are not passed as part of the Props.

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

// todo need to add about ref APIs, see the runtime package docs

## State Management

// todo need to explain about jay reactive scope for a component, 
// that props are reactive getters, the render function is a reactive getter
// and that and signal or other hooks are also reactive.
// also that the constructor function is only called once, but render
// is called any time it's reactive dependencies change.
// need to define reactive dependency (reading a signal getter)

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

Use `createEffect` for side effects:

// todo need to explain event hand return a shutdown function
// that is called automatically when needed
// 1. when the component unmounds
// 2. when a reactive dependency of the event changes, we first call the shutdown, then rerun the event

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
  });
}
```

// todo jay state management has more hooks that at the very least 
// we should list here. See the component package.

## Event Handling

### Basic Event Handling

Attach event handlers to referenced elements:

```typescript
function ButtonConstructor(props, refs) {
  refs.button.onclick(() => {
    console.log('Button clicked!');
    props.onClick?.();
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

Handle form events with proper typing:

```typescript
function FormConstructor(props, refs) {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  
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
// todo this is not how events are working in jay - see the runtime package docs        
      await props.onSubmit?.({ email: email(), password: password() });
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  });
  
  // Keyboard events
  refs.emailInput.onkeydown((event) => {
    if (event.key === 'Enter') {
      refs.passwordInput.focus();
    }
  });
}
```

### Custom Events

Handle custom events from child components:

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

// todo missing a section on how to define component events.
// see the runtime package

## Component Composition

### Using Child Components

Compose components by using child components:

```typescript
function DashboardConstructor(props, refs) {
  const [user, setUser] = createSignal(null);
  const [posts, setPosts] = createSignal([]);
  
  // Pass data to child components
  return {
    render: () => ({
      user: user(),
      posts: posts(),
      // Child components will receive their props automatically
    }),
  };
}
```

### Context and Communication

Use context for component communication:

// todo this section is missing the `makeJayComponent` for Profile 
// with the declaration of UserContext.
// the consumption api is wrong - see the runtime package docs
// it also has to explain that in the jay-html of the app, the profile is used as a child component.

```typescript
import { createJayContext, provideContext } from 'jay-runtime';

const UserContext = createJayContext<{ user: User; updateUser: (user: User) => void }>();

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

function ProfileConstructor(props, refs) {
  // Consume context from parent
  const userContext = useContext(UserContext);
  
  refs.editButton.onclick(() => {
    userContext.updateUser({ ...userContext.user, name: 'New Name' });
  });
  
  return {
    render: () => ({ user: userContext.user }),
  };
}
```

## Lifecycle Management

### Component Initialization
// todo this looks like a good example, but not a section under lifecycle

Initialize components with proper setup:

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
// todo again - this looks like a good example, but not a section under lifecycle

Manage resources properly:

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
      
      await props.onSubmit?.();
      
      // Success handling
      props.onSuccess?.();
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

## Next Steps

Now that you understand component development:

1. **Learn Jay Stack** - Build full-stack components with server-side rendering
2. **Master State Management** - Advanced reactive patterns and state management
3. **Explore Examples** - See real-world component patterns
4. **Build Your App** - Apply these concepts to your own application

---

Ready to build full-stack applications? Check out the [Jay Stack Components](./jay-stack.md) guide! 