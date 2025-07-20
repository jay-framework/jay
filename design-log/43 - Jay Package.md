# Jay Package

This design doc discusses how to include Jay headless components in an NPM Package,
so that Jay dev server can tell about them to an editor, and an application can use them as defined in
[40 - changing jay-html format.md](40%20-%20changing%20jay-html%20format.md)

## why not Headfull components?

Simply put, headfull components have a jay-html, and restrict editing of the UI.
Headless components are equivalent logic, and the package can include headless component default or template design,
which make them fully equivalent with full design customization options.

## Jay Package Structure

Jay Package is an NPM package that has to include, at the very least, the contract files and exported
code for the headless components.

Technically, for an NPM package to export additional files to `main`, it has to define a `files` member
to know what to package and an `exports` member to know what is accessible from those package files

```json
{
  "main": "dist/index.js",
  "files": ["dist"],
  "exports": {
    ".": "./dist/index.js",
    "./mood-tracker.jay-contract": "./dist/mood-tracker.jay-contract"
  }
}
```

The suggested

// todo - define how to work with meta contracts, such as CMS and A/B tests
