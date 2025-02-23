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

### Slowly changing Data Rendering

The slowly changing data rendering is used to load param values for pages with url parameters, as well as loading 
system parameter values (languages). The rendering continues by loading data for each set of params and pre-rendering the page.

![34 - jay stack - rendering flow - slowly changing.mmd](34%20-%20jay%20stack%20-%20rendering%20flow%20-%20slowly%20changing.svg)

1. Given a route to a `jay-html` file, the file is loaded. 
2. Call the url loading API to load all dynamic `param` values - set of `params` and `system params`.
   1. `params` - defined by the application, like `slug`.
   2. `system params` - defined by Jay, but loaded by the application, like `lang`.
3. For each set of `(params, system params)` load the `server view state` and `server props`.
   1. The `server view state` is used for pre-rendering.
   2. The `server props` are used for fast rendering.
4. The `server view state` is used to pre-render the `jay-html` into `pre-rendered-jay-html`.
   1. The `pre-rendered-jay-html` is the `jay-html` with the `server view state` values replaced, 
      as well as compiled to server JS to render `HTML` given the rest of the `view state` at the fast changing data rendering.  

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
3. render the final `html` with the `client props` as part of the content
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