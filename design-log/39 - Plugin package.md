# Plugin Package

The Plugin package is a tool to create reusable Jay Components and Contracts to be installed
from a design tool, and used "no coding", or used and extended with coding.

Requirements for the Plugin Package

1. Ability to install a plugin package from a design tool
2. Ability of a package to have one or more contracts, used by the design tool to build pages
3. Ability of each contract to have implementing Jay component
4. Support different types of contracts
   1. page contract, which defines a page, such as a product page or cart page
   2. Sub-component contract, which defines a component who can be positioned on any page, such as promoted product
5. Support dependencies between contracts and plugins
   1. A plugin `B` can expand plugin `A`, requiring it to be installed to function
   2. A Plugin `B` contract can expand plugin `A` in the contract of a specific page contract,
      requiring to use `B`'s contract on the `A`'s contract page
   3. Ability to hand over data from the `A` plugin contract jay component to `B`s jay component
6. Plugin package should optionally include design tool assets to be used for seeding design tool designs on plugin installation
7. Plugins with pages should get a facility to map logical pages to actual URLs, enabling creating links between pages.

Requirement for the Jay Application using Plugins

1. Ability to install multiple plugin contracts on each page
2. Plugin contracts installed on a page should work `no coding` on the application page
3. Application page code should be able to define page contract and write an application page component
4. Application page code should be able to override the `ViewState` of plugins installed in the page
5. Application page code should be able to use APIs of plugins installed on the page

# Modeling a Application & Plugin Package

## Runtime Dependencies

### modeling on refs

We can model the runtime dependencies between the `Page` and plugin `A`, and between plugin `B` and plugin `A`
as a `ref` from the dependant to the dependency. Using a Jay `component ref` we gain access to the dependent plugin
APIs, including functions and events.

However, refs are only available on the interactive stage, and not in the slowly / fast stages.

### modeling on context

We can model the runtime dependencies between the `Page` and plugin `A`, and between plugin `B` and plugin `A`
as a `Context` that plugin `B` publishes (using a new API / same API?) and both `Page` and plugin `A` consume (using the regular context API).

Context API supports reactive getters and API functions.

### runtime dependencies - selection

Modeling on Context looks like a superior option because of the support for backend using server contexts.

## Overriding plugin ViewState

One way to model the overriding of a plugin ViewState is to use it as part of the `Props` and `ViewState` of the `Page` component.
For each installed plugin, we add to the `PageViewState` a member of the `PluginViewState`

```typescript
interface PageViewState {
  // page members
  plugin?: PluginViewState;
}
```

To ensure when coding the page component, one does not have to return all the time the `PluginViewState` we set it as optional.

Now, we add to the page component `Props` the `PluginViewState`. As the system is reactive, we set the `PluginViewState`
value to be the `render` value from the plugin. If the developer of the page component decides to override the `PluginViewState`,
they just have to read it from the `prop`, change it, and return it as part of the component `render` function.

## Page Component vs Sub-Component

Page Component is a component that defines a page. On a page, there can only be a single page component of a plugin.
Page Components cannot be explicitly placed in a `jay-html` template, and cannot be under `forEach`.

A Page may have multiple page components of different plugins.

A Sub Component is a component that defines an area on the page with an encapsulated logic. Sub-Components can appear multiple
times in a page, including under `forEach`.

The plugin package is assumed to define which is a page component and which is a sub-component.

Sub-component in `jay-html`

```html
<header>
  <title>Todo element</title>
  <link rel="import" href="./item" names="Item" />
</header>
<body>
  <!-- some markup structure -->
  <Item title="{title}" isCompleted="{isCompleted}" forEach="shownTodos" trackBy="id" ref="items" />
</body>
```

Page component in `jay-jyml`

```html
<header>
  <title>Todo element</title>
  <link rel="import" href="stores/product-page" />
</header>
```
