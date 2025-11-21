# Full Stack Component refinement for gradual rendering

The Jay full stack component, created using the Syntax below, is based on the `ViewState` type for page rendering, 
where `renderSlowlyChanging` renders part of the `ViewState` members and both `renderFastChanging` and `ProductsPageConstructor`
render the rest of the `ViewState` members. 

The current API is at [jay-stack-builder.ts](packages/jay-stack/full-stack-component/lib/jay-stack-builder.ts), 
and an example usage is

```typescript
export const page = makeJayStackComponent<typeof render>()
  .withProps<PageProps>()
  .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
  .withLoadParams(urlLoader)
  .withSlowlyRender(renderSlowlyChanging)
  .withFastRender(renderFastChanging)
  .withInteractive(ProductsPageConstructor);
```

The above has a problem that it does not capture the relationship between the rendering phases accurately. 
We need to extend the above with

1. ability to define for nested properties (under objects and arrays) which is rendered at which phase.
2. ability to define when an array elements are set, and elements cannot be added / removed / moved in the array.
3. support for 3 rendering modes
   4. slow rendering
   5. fast rendering
   6. fast and interactive rendering

Note: 
- it does not make sense to combine (for the same attribute) slow and fast rendering, 
  as fast rendering will override the slow rendered value
- it does not make sense to render only interactive value, as what will be rendered for it on SSR?
- when an array is interactive (as we can add elements on the client), all the array child attributes have to be
  also interactive, as we can add a new item and we need all the data.
- when an array is rendered slowly or fast, it means that array items cannot be added or removed in the interactive phase.

## direction of the solution 

We suggest to add another builder phase at which we provide a schema, additional metadata for the product state type
as a constant (that can be used in runtime) and as a type (that can be used to define the Slowly, Fast and Interactive ViewState)

We want the schema to define, for each attribute of the view state, what rendering phase it is rendered at.


