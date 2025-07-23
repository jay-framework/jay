# CSS support

When a jay-html file contains CSS (either via `<link>` tags or inline `<style>`), the compiler will extract the CSS and replace it with a CSS import based on the jay-html filename.

## Process

1. **Extraction**: CSS content from `<link>` and `<style>` tags is extracted from the jay-html file
2. **Replacement**: CSS references are replaced with a single CSS import using the pattern `[filename].css`
3. **File generation**: Extracted CSS is written to a corresponding `.css` file
4. **Vite integration**: The vite plugin uses Vite's built-in CSS handling to bundle and serve the CSS files

## Example

**Input jay-html file (`counter.jay-html`):**

```html
<link rel="stylesheet" href="styles.css" />
<style>
  .counter {
    color: blue;
  }
</style>
<div class="counter">...</div>
```

**Output jay-html file:**

```html
<link rel="stylesheet" href="counter.css" />
<div class="counter">...</div>
```

**Generated CSS file (`counter.css`):**

```css
/* content from styles.css */
.counter {
  color: blue;
}
```

This approach leverages Vite's existing CSS pipeline while maintaining the declarative nature of jay-html files.

## Vite Plugin Implementation

The vite plugin will handle CSS extraction and virtual file creation to ensure proper CSS serving during development
(simplified example for clarity):

```javascript
export function jayHtmlPlugin() {
  return {
    name: 'jay-html-transform',

    async transform(code, id) {
      if (id.endsWith('.jay-html')) {
        const { css, html } = parseJayHtml(code);

        if (css) {
          // Create a virtual CSS file that Vite can process
          const cssId = `${id}.css`;

          // Register the CSS with Vite's module graph
          this.addWatchFile(id); // Watch the original file

          // Let Vite handle the CSS processing and HMR
          const cssModule = await this.resolve(cssId, id);

          return `
            import "${cssId}";
            ${html}
          `;
        }

        return html;
      }

      // Handle virtual CSS files
      if (id.endsWith('.jay-html.css')) {
        const originalId = id.replace('.css', '');
        const originalCode = await this.load({ id: originalId });
        const { css } = parseJayHtml(originalCode);
        return css;
      }
    },
  };
}
```

This implementation ensures that:

- CSS is properly extracted and served by Vite's dev server
- Hot Module Replacement (HMR) works for both HTML and CSS changes
- The virtual CSS files are processed through Vite's CSS pipeline
- CSS imports are automatically injected into the transformed HTML
