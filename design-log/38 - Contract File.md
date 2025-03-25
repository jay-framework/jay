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
    - tag: filter
      data type: enum (all | active | completed)
      variant: enum (all | active | completed)
      description: variant of the selected filter applied to the list of todo items
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
2. using `data type` we understand it is data, using `interactive type` we understand it is interactive tag. 
   how to indicate a variant? when a tag is both data and variant, the definition looks redundant.

```YAML
contract:
  name: Todo List
  tags:
    - tag: newTodo
      data: 
        string: the new todo item text data 
      interactive: 
        HTMLInputElement: interactive element to edit it
        
    - tag: filter
      data:
         all: show all the items 
         active: show only active items
         completed: show only completed items
      description: variant of the selected filter applied to the list of todo items
      
    - sub contract: shownTodos
      tags:
        - tag: title
          data: 
             string: the todo item text
          interactive:
             HTMLInputElement: interactive element to edit it
             
        - tag: isCompleted  
          data:
            boolean: indicating if the todo item is active or completed
          interactive: 
            HTMLInputElement: interactive element to toggle between active and completed
```
with this option, any data that is `boolean` or `enum` is also a variant.

Another alternative, a little bit more explicit while still handling all the concerns above
```yaml
contract:
   name: Todo List
   tags:
      - tag: newTodo
        type: [data, interactive]
        dataType: string
        elementType: HTMLInputElement
        description: [new todo item value, entering a new todo item text] 

      - tag: filter
        type: variant
        variantType: enum
        values: [all, active, completed]
        description: "variant of the selected filter applied to the list of todo items"

      - tag: filterAll
        type: interactive
        elementType: [HTMLAnchorElement, HTMLButtonElement]
        description: "clears any other filter"

      - subContract: shownTodos
        tags:
           - tag: title
             type: [data, interactive]
             dataType: string
             elementType: HTMLInputElement
             description: ["the todo item text", "interactive element to edit it"]

           - tag: isCompleted
             type: [data, interactive, variant]
             dataType: boolean
             elementType: HTMLInputElement
             description: ["indicating if the todo item is active or completed", 
                           "interactive element to toggle between active and completed",
                           "variant for active or completed todo item"]        
```

Another concern is contract reuse, which we can form as 
```YAML
contract:
   name: Todo List
   tags:
      - sub contract: shownTodos
        link: <filepath of the reused contract>
```

## Formal definition of a contract file

We define a contract file as a `YAML` file, at which onw file holds one contract.
A contract can be used as a component contract, as a page contract or reused as a sub contract of each.

The structure of a contract file includes
* top level `contact:`
* `name` - the name of the contract
* `tags` - a list of tags of the contract. 

Each tag definition includes
* `tag` - the name of the tag
* `type` - one or more of `data`, `interactive`, `variant`, as a value (one value) or a list (two or three values)
* `required` - if the tag is required. defaults to `false`
* `dataType` - the data type for `data` or `variant` tags
  * for `data` tags - can be `string`, `number`, `boolean`, `enum`, `Currency`, `Date`, `DateWithTimezone` and `Promise<T>`
  * for `variant` tags - can be `boolean` or `enum`
  * `enum` requires a following key `values`
  * `Promise<T>` requires a following key `resolveTo`
* `values` - list of enum values
* `resolvesTo` - the type a promise is resolved to, which can be any valid `dataType`
* `elementType` - the interactive element type for `interactive` elements. 
  The element type can be any valid DOM element type, an imported Jay component, or a list of types.
* `description` - description of the tag. Can be a text, or a list of texts if we want different description per tag type
* `subContract` - defines an hierarchical structure of contracts, which is the equivalent of `Array<object>` or `object`.
  sub contracts definition includes
  * `cardinality` - optional, indicating if `one` or `many` are allowed. defaults to `many`
  * `link` - link to a contract from another file
  * `tags` - the tags of the sub contract

application package

- navigation map
- pages
- contracts
- context
- components (Jay Component)
- figma assets