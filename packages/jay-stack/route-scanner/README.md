# Jay Stack Route Scanner

A utility for scanning a directory structure and generating route definitions for Jay stack applications. Supports static, parameterized, optional, and catch-all routes, and can convert them to Express-compatible route strings.

## Overview

The route-scanner walks your pages directory and produces a list of route definitions based on the folder and file structure. It is used internally by the Jay stack dev server, but can also be used standalone for custom routing logic or integrations.

## Features

- **Static routes** (e.g. `/about`)
- **Root route** (e.g. `/`)
- **Parameterized routes** (e.g. `/user/[id]` → `/user/:id`)
- **Optional parameter routes** (e.g. `/blog/[[slug]]` → `/blog/:slug?`)
- **Catch-all routes** (e.g. `/files/[...path]` → `/files/:path*`)
- **Nested routes** (arbitrary nesting of the above)
- **Express route conversion**

## Usage

```ts
import { scanRoutes, routeToExpressRoute } from 'jay-stack-route-scanner';

const routes = await scanRoutes('./src/pages', {
  jayHtmlFilename: 'page.jay-html',
  compFilename: 'page.ts',
});

routes.forEach((route) => {
  console.log('Route:', route.rawRoute, 'Express:', routeToExpressRoute(route));
});
```

## Supported Routing Patterns

Given a directory structure like:

```
src/pages/
├── page.jay-html                // root route ('/')
├── about/
│   └── page.jay-html            // '/about'
├── user/
│   └── [id]/
│       └── page.jay-html        // '/user/[id]' → '/user/:id'
├── blog/
│   └── [[slug]]/
│       └── page.jay-html        // '/blog/[[slug]]' → '/blog/:slug?'
├── files/
│   └── [...path]/
│       └── page.jay-html        // '/files/[...path]' → '/files/:path*'
```

### Segment Syntax

- `segment/` — static segment (e.g. `/about`)
- `[param]/` — required parameter (e.g. `/user/:id`)
- `[[param]]/` — optional parameter (e.g. `/blog/:slug?`)
- `[...param]/` — catch-all parameter (e.g. `/files/:path*`)

### Example Output

For the above structure, `scanRoutes` will produce route objects like:

```js
[
  { rawRoute: '', segments: [] }, // '/'
  { rawRoute: '/about', segments: ['about'] },
  { rawRoute: '/user/[id]', segments: ['user', { name: 'id', type: 'single' }] },
  { rawRoute: '/blog/[[slug]]', segments: ['blog', { name: 'slug', type: 'optional' }] },
  { rawRoute: '/files/[...path]', segments: ['files', { name: 'path', type: 'catchAll' }] },
];
```

And `routeToExpressRoute(route)` will convert these to:

- `/` (root)
- `/about`
- `/user/:id`
- `/blog/:slug?`
- `/files/:path*`

## API

### `scanRoutes(rootDir, options)`

- `rootDir`: Path to the pages directory
- `options.jayHtmlFilename`: Name of the HTML file to look for (default: `page.jay-html`)
- `options.compFilename`: Name of the component file to look for (default: `page.ts`)
- Returns: Array of route objects with `compPath`, `jayHtmlPath`, `rawRoute`, and `segments`

### `routeToExpressRoute(route)`

- Converts a route object to an Express-compatible route string
