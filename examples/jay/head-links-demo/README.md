# Head Links Demo

This example demonstrates how Jay-HTML handles head links. It shows various types of `<link>` elements that can be defined in Jay-HTML files and automatically injected into the document head.

## Features Demonstrated

- **Stylesheets**: Local and external CSS files
- **Icons**: Favicons and app icons
- **Performance**: Preconnect links for external resources
- **PWA**: Web app manifest links
- **RSS**: Feed links for content syndication

## How It Works

1. **Jay-HTML Definition**: The `head-links-demo.jay-html` file contains various `<link>` elements in the `<head>` section
2. **Compilation**: The Jay compiler parses these links and generates TypeScript code that calls `injectHeadLinks`
3. **Runtime Injection**: When the component renders, the links are automatically injected into the document head
4. **Duplicate Prevention**: The runtime prevents duplicate links by checking both `href` and `rel` attributes

## Running the Example

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Serve the built files
npm run serve
```

Then open your browser and inspect the `<head>` section to see the injected links!

## Key Files

- `head-links-demo.jay-html` - The Jay-HTML file with head links
- `styles/main.css` - Demo stylesheet (loaded via head link)
- `lib/main.ts` - Main application entry point
- `index.html` - HTML page that loads the compiled component

## Generated Code

The compiler generates TypeScript code similar to:

```typescript
import { injectHeadLinks } from '@jay-framework/runtime';

injectHeadLinks([
  { rel: 'stylesheet', href: 'styles/main.css' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap',
  },
  { rel: 'icon', href: '/favicon.ico' },
  { rel: 'icon', type: 'image/png', href: '/favicon.png' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', attributes: { crossorigin: '' } },
  { rel: 'manifest', href: '/manifest.json' },
  {
    rel: 'alternate',
    href: '/feed.xml',
    attributes: { type: 'application/rss+xml', title: 'RSS Feed' },
  },
]);
```

## Learn More

- [Jay-HTML Documentation](../../../docs/core/jay-html.md#head-links)
- [Runtime Documentation](../../../packages/runtime/runtime/docs/runtime.md#injectheadlinks)
