# Jay Stack

Jay Stack is the name of the full stack framework for Jay. 
Like anything else in Jay, it is first designed to enable a design tool to create designs with collaboration
with a developer building features.

## The requirements for the Jay Stack

1. Integrated with a design tool, such that
   1. A design tool can create new pages
   2. A design tool can add functionality with pre-made contracts to a page
   4. A design tool can use a project defined functionality with project defined contract on a page
   5. A design tool can use pre-made components or project defined components on a page
6. Support page routing, including
   1. page url
   8. page url with parameters
   9. page url with optional and catch all parameters
   10. support different error pages
11. support rendering model for website, including
    1. url / param loading for pages with params
    13. slowly changing data support and pre-rendering
    14. routing hook to redirect and choose pre-rendered page
    15. fast changing data support and rendering
    16. async data rendering
    16. client hydration and rendering
11. support an application model, pre-made functionalities that can be installed at the design tool, including
    1. pre-made page functionality
    13. application global context for setting
    14. application pre-made components to be added to pages
    15. application navigation, how to navigate from one application page to another

# The Key concepts of Jay Stack are 

1. Pages - similar to any other meta framework, a page is a definition file that generates one or more website pages
2. Page Component - the Jay Component of the page. A Page can have more then one Page Component (due to applications).
3. Application - an entity to be installed at the design tool. An application consists of Designed Pages, Page Components, 
   General application context and settings and Application Components. 
4. Jay Components - including the Jay component and Jay element.
5. Backend code
6. Frontend code

## File-system layout

```
/src
  /pages
    /page.jay-html           -- index page on route /
    /products
      /[slug]/page.jay-html        -- product page on route /products/[slug], where slug is a parameter
    /[[lang]]/shop            -- optional parameter
      /[...slugs]/page.jay-html    -- catch all route
      /[[...slugs]]/page.jay-html  -- optional catch all route
  /components
  /node_modules
    /app-1                    -- application functionality, including pages and components
      /manifest.json          -- file describing the content of the application
        /page-1
          /page.ts            -- the page component
```

## rendering process

The Jay rendering process has 3 steps - of which all are optional.

1. slowly changing data rendering (similar to SSG in other frameworks)
2. fast changing data rendering (similar to SSR in other frameworks)
3. client rendering

**This section presents the flow and ideas for the rendering process. 
Next we will explore different APIs to package those ideas.**

### Slowly changing Data Rendering

The slowly changing data rendering is used to load param values for pages with url parameters, as well as loading 
system parameter values (languages). The rendering continues by loading data for each set of params and pre-rendering the page.

![34 - jay stack - rendering flow - slowly changing.mmd](34%20-%20jay%20stack%20-%20rendering%20flow%20-%20slowly%20changing.svg)

1. Given a route to a `jay-html` file, the file is loaded. 
2. Call the url loading API to load all dynamic `param` values - set of `params` and `system params`.
   1. `params` - defined by the application, like `slug`.
   2. `system params` - defined by Jay, but loaded by the application, like `lang`.
3. For each set of `(params, system params)` load the `server view state` and `server props`.
   1. The `server view state` is used for pre-rendering the jay-html.
   2. The `server props` are used for fast rendering.
3. The `server view state` is mapped to child components `props`, which are used to call the child components slowly data loading.
   The child components return also `server view state` and `server props`. 
4. The `server view state` is used to pre-render the `jay-html` into `pre-rendered-jay-html`.
   1. The `pre-rendered-jay-html` is the `jay-html` with the `server view state` values replaced, 
      as well as compiled to server JS to render `HTML` given the rest of the `view state` at the fast changing data rendering.
   2. There can be more then one `jay-html`s pre-rendered - one for the page, and additional ones for the child components.

The App APIs
```typescript
declare async function urlLoading(settings: AppSettings): Promise<Params & SystemParams>
declare async function slowlyChangingDataLoader(params: Params & SystemParams, settings: AppSettings): Promise<ServerViewState, ServerProps>
declare async function rerenderRoute(params: Params);
```

### fast Changing Data Rendering

The fast changing data rendering starts with a `pre-rendered jay-html`, or the original `jay-html` is no pre-rendering was done.
Given the application `server props`, it loads the `view state` to render the final `html` to be sent to the browser, 
as well as `client props` to be sent to the client component as part of the `html` content.  

![34 - jay stack - rendering flow - fast changing.svg](34%20-%20jay%20stack%20-%20rendering%20flow%20-%20fast%20changing.svg)

1. Given a route to `jay-html` file and extracting `parameters` from the `HTTP Request`, load the `pre-rendered jay-html`
   or, if not present, the original `jay-html`.
   1. If `pre-rendered jay-html` is found, the `props` are the `ServerProps` as defined in the slowly changing phase.
   2. If not found, the original `jay-html` is used, the `props` are the extracted `params` from the url & `SystemParams`.
2. load the fast changing data and return 
   1. The data for rendering - `view state` and `client props`
   2. redirect
   3. error
   4. other HTTP statuses
3. load child components fast changing data, again returning `view state` and `client props`.
4. render the final `html` with the `client props` as part of the content
   1. The server can render the `jay-html` as `HTML`
   2. The server embeds in the `HTML` the client scripts for the applications included
   3. The server embeds in the `HTML` the `client props`

The App APIs
```typescript
declare async function fastChangingDataLoader(props: ServerProps, settings: AppSettings): RouteResult
declare type RouteResult = Render<ViewState, ClientProps> | NotFound | TemporaryRedirect | PermanentRedirect | 
    Error | HTTPStatus 
```

### Client Rendering

The client rendering starts with a loaded `HTML` file importing the client library of the application.

![34 - jay stack - rendering flow - client rendering.svg](34%20-%20jay%20stack%20-%20rendering%20flow%20-%20client%20rendering.svg)

1. Links in the `HTML` page header load the applications components of the page.
   1. Alternatively, we can delay the application components loading to an actual interaction.
2. A script in the `HTML` page reads the `client props` of each application
3. The script initializes each application component with the `client props`
4. The page is now interactive using Jay logic

### App Settings

The `AppSettings` member of all the app APIs above is a structure enabling the configuration of an application from 
the design tool. It is required as a design tool does not have access to configure environment variables or secrets, 
while configuration of NPM imported packages is always a challenge. The `AppSettings` are to put order in this space.

It is a server environment only entity, which includes an abstraction of configurations and secrets. 

```typescript
declare interface AppSettings {
    getConfig(key: string): string
    getSecret(key: string): string
}
```

## Data Flow

This section describes how different sources of data flow to the different stages of page rendering. 

![34 - jay stack - page data flow.svg](34%20-%20jay%20stack%20-%20page%20data%20flow.svg)

The inputs are:
1. `params` - from the url params of all applications installed on the page, as defined by each application `urlLoader`. 
2. `systemParams` - params that applications can load with the `urlLoader` stage, that are known and shared, like `lang`
3. `pageSettings` - an application config for this page
4. `appSettings` - an application config for the whole application, including both config and secrets
5. the slowly changing data stage is running on build time / startup time / data change time, 
   accepting all the above sources (1..4), and produces `server carry forward` 
   and a partial `view state` for early rendering of slowly changing data. 
   Any value rendered at this stage is considered constant by later stages.
6. the fast changing data stage is running on page serving as part of server side rendering, 
   accepts the `params`, `systemParams`, `pageSettings`, `appSettings` and the `server carry forward` 
   and produces the `client carry forward` and a partial `view state` to complete the html rendering of the page.
7. the client rendering accepts only the `params`, `systemParams` and `client carry forward` and 
   produces the same partial `view state` as the fast changing stage for interactive rendering

## Component API

We extend the component API to support slowly and fact changing data, to support the flows above.

We explore 3 different API alternatives, on the store product page case, in

1. [34 - 1 - jay stack - separate loaders API option.md](34%20-%201%20-%20jay%20stack%20-%20separate%20loaders%20API%20option.md)
2. [34 - 2 - jay stack - hooks style API option.md](34%20-%202%20-%20jay%20stack%20-%20hooks%20style%20API%20option.md)
3. [34 - 3 - jay stack - name convention based API option.md](34%20-%203%20-%20jay%20stack%20-%20name%20convention%20based%20API%20option.md)

It looks like the first option is the best because as it is the simplest,
and if we need server context to pass to client context (not final), this option works best.

## Context discussion

Do we really need server context as a separate API?
maybe we only need an application to be able to provide client context?

In server environment, a server `urlLoader`, `renderSlowlyChanging` and `renderFastChanging` can just import
a module who loads the app settings and acts as the context for all server functions.

The `renderFastChanging` function can pass information to the page `makeJayComponent` who can
provide a jay context to any child components.

Still, for server operations, it makes sense to have a singleton object that holds connections to network,
configured API clients, etc. How does an application declares such a server component?

Maybe, instead of server context as in `provideServerContext`, we need instead a mechanism
for an application imported from `NPM` library or from the project code to initialize, such that
the initialization result is actually the server context provided to all server hooks?

one such mechanism is the default initialization of code running as part of a module import. 
Such global code can use an API to load settings and secrets, initialize a global server state of the application.
However, such an option does not, by default, support settings reload during development (which can be mitigated using 
a dedicated API).

However, context is still needed for passing data from parent component to child components, or from the page
component to child components. JayStack may introduce a way for an application to provide context to child components 
of the application.

Consider a store application, with a related products component that can be placed on any page. 
The store application can have a page main component which only provides a store context, including the current product
on a product page. The related products component can then use that context to show contextual related products.

This leads to the result that we need both client and server contexts, which are responsible to pass information 
from parent to child components. The `urlLoader`, `renderSlowlyChanging` and `renderFastChanging` are responsible for 
passing information from server to client. 

## proposed full stack component API

```typescript
import {Component} from "react";

type UrlParams = Array<Record<string, string>>
type LoadParams<ServerContexts> = (contexts: ServerContexts) => Promise<UrlParams>

interface PartialRender<ViewState extends object, CarryForward> {
    render: Partial<ViewState>,
    carryForward: CarryForward
}

type RenderSlowly<ServerContexts, PropsT extends object, ViewState, SlowlyCarryForward> =
    (contexts: ServerContexts, props: PropsT) => PartialRender<ViewState, SlowlyCarryForward>
type RenderFast<ServerContexts, PropsT extends object, SlowlyCarryForward, ViewState, FastCarryForward> =
    (contexts: ServerContexts, props: PropsT) => PartialRender<ViewState, FastCarryForward>

interface ComponentDeclaration<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    SlowlyCarryForward extends object,
    FastCarryForward extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> {
    elementPreRender: PreRenderElement<ViewState, Refs, JayElementT>,
    loadParams?: LoadParams<ServerContexts>
    renderSlowlyChanging?: RenderSlowly<ServerContexts, PropsT, ViewState>,
    renderFastChanging?: RenderFast<ServerContexts, PropsT & SlowlyCarryForward, SlowlyCarryForward, ViewState>
    comp: ComponentConstructor<PropsT & FastCarryForward, Refs, ViewState, ClientContexts, CompCore>,
}

declare export function makeJayStackComponent<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    SlowlyCarryForward extends object,
    FastCarryForward extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    compDeclaration: ComponentDeclaration<PropsT, ViewState, Refs, SlowlyCarryForward, FastCarryForward, 
        JayElementT, ServerContexts, ClientContexts, CompCore>,
    serverContextMarkers: ContextMarkers<ServerContexts>,
    clientContextMarkers: ContextMarkers<ClientContexts>
): (props: PropsT) => ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT>
```

The above `makeJayStackComponent` is compiled into `makeJayComponent` for the client application, 
and in server environment is used to run `loadParams`, `renderSlowlyChanging` and `renderFastChanging` if present.


and for server context
```typescript
declare function provideServerContext<ContextType>(
    marker: ContextMarker<ContextType>,
    context: ContextType,
)
```

