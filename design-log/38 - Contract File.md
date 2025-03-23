# Contract File & Application package

The Jay Contract file is needed to create library components and applications who specify a contract, but do not 
specify a specific UI. For instance, a service page component can specify the contract of the services page, without 
specifying the actual UI.

An Application Package is an NPM package that includes a Jay Application that can be installed into a site. 
An editor environment can use the information in the Jay Application package to read the list of contracts, default 
design for pages and components, application settings and page settings, as well as other things we will add later.

## The Contract File

The contract file is used
1. by design tools to create UI connected to the contract, including indicators like required and descriptions.
2. generate the `ViewState` and `Refs` types the component is using.

The format selected for the Jay Contract File is a `YAML` formal, with a hierarchical structure capturing the
contract hierarchical structure.

To set the syntax of the `YAML` file, we take as an example the [todo-one-flat-component](..%2Fexamples%2Fjay%2Ftodo-one-flat-component)
contract. 

```yaml
contract:
  name: Todo List
  tags:
    - dynamic data: newTodo
      type: string
      description: the new todo item text as it is edited in the newTodo input
    - interactive: newTodo
      type: HTMLInputElement
      description: an input to type in the new todo item.
    - variant: hasItems
      type: boolean
      description: what to display when there are items to show in the list, or not
    - variant: filter
      type: enum (all | active | completed)
      description: variant of the selected filter applied to the list of todo items
    - interactive: filterAll
      type: HTMLAnchorElement | HTMLButtonElement
      description: clears any other filter
    - interactive: filterActive
      type: HTMLAnchorElement | HTMLButtonElement
      description: filters the list of todo items to show only the active items
    - interactive: filterCompleted
      type: HTMLAnchorElement | HTMLButtonElement
      description: filters the list of todo items to show only the completed items
    - sub contract: shownTodos
      tags:
        - dynamic data: id
          type: string
        - dynamic data: title
          type: string
          description: the todo item itself
        - interactive: title
          type: HTMLInputElement
          description: an input used for editing the todo item
        - dynamic data: isCompleted
          type: boolean
          description: indicating if the todo item is active or completed
        - variant: isCompleted
          type: boolean
          description: is the todo item completed?
        - interactive: completed
          type: HTMLInputElement
          description: an input element used to toggle the todo item between active and completed
        - variant: isEditing
          type: boolean
          description: is the todo item in editing state, or display state?
        - interactive: label
          type: HTMLLabelElement
          description: a label element that when clicked, enables the editing of the todo item
        - interactive: button
          type: HTMLButtonElement
          description: a button used to remove the todo item from the list of todo items
```

We can see in the above example that when focusing on tag types, we have duplicate tags 
(`newTodo`, `title`, `isCompleted` and `completed`). Lets try and create a more coherent format

```YAML
contract:
  name: Todo List
  tags:
    - tag: newTodo
      data type: string
      interactive type: HTMLInputElement
      description: the new todo item text data and interactive element to edit it
    - sub contract: shownTodos
      tags:
        - tag: title
          data type: string
          interactive type: HTMLInputElement
          description: the todo item text and interactive element to edit it
        - tag: isCompleted  
          data type: boolean
          variant: boolean
          interactive type: HTMLInputElement
          description: indicating if the todo item is active or completed, and the interactive element to toggle between active and completed
```

The above is better, yet still raises two questions - 
1. should the description be one or two? it seems very clear that the description of data and interactive tags are different
2. how to indicate a variant? when a tag is both data and variant, the definition looks redundant. 