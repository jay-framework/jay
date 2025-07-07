# Jay Stack CLI

A command-line interface for running Jay stack applications in development mode.

## Overview

The Jay Stack CLI provides a simple way to start both development and editor servers for Jay applications. It automatically configures and runs the Jay development server and editor server with sensible defaults, making it easy to get started with Jay stack development.

## Installation

```bash
npm install @jay-framework/stack-cli
```

## Usage

### Basic Usage

Simply run the CLI from your project root:

```bash
@jay-framework/@jay-framework/jay-cli
```

This will start both the development server and editor server with default configuration.

### Configuration

The CLI uses a `.jay` configuration file (YAML format) to customize port ranges for both servers. Create a `.jay` file in your project root:

```yaml
devServer:
  portRange: [3000, 3100]
  pagesBase: './src/pages'  # Directory containing your Jay pages
  publicFolder: './public'  # Directory for static files (CSS, JS, images, etc.)
editorServer:
  portRange: [3101, 3200]
  # editorId will be automatically set when an editor connects
```

If no `.jay` file is found, the CLI will use default values:

- **Dev Server Port Range**: `3000-3100`
- **Pages Directory**: `./src/pages`
- **Public Folder**: `./public`
- **Editor Server Port Range**: `3101-3200`

The CLI automatically finds available ports within these ranges using the `get-port` package.

**Note**: The `editorId` field in the configuration will be automatically updated when an editor connects to the server.

## Default Configuration

The CLI uses the following default configuration:

- **Pages Directory**: `./src/pages` - All Jay pages should be placed in this directory
- **Public Folder**: `./public` - Static files (CSS, JS, images) are served from this directory
- **TypeScript Config**: `./tsconfig.json` - Uses the project's TypeScript configuration
- **Output Directory**: `build/@jay-framework/runtime` - Compiled Jay runtime files
- **Dev Server Port Range**: `3000-3100` - Automatically finds available port
- **Editor Server Port Range**: `3101-3200` - Automatically finds available port
- **Base Path**: `/`

## Project Structure

Your project should have the following structure:

```
your-project/
├── src/
│   └── pages/                      # Your Jay pages go here
│       ├── page.jay-html           # homepage
│       ├── page.ts                 # optional logic for the page
│       └── page2/
│           ├── page.jay-html       # a page with the url /page2
│           └── page.ts             # optional logic for page2
│       └── segment/
│           ├── page.jay-html       # the root page for the url subdirectory /segment
│           ├── page.ts             # optional logic for the segment root page
│           └── [slug]/             # parameterized segment
│               ├── page.jay-html   # a page with url parameters
│               ├── page.ts         # optional logic for the segment parameterized page
├── public/                         # Static files (CSS, JS, images, etc.)
│   ├── styles.css
│   ├── script.js
│   └── images/
├── tsconfig.json                   # TypeScript configuration
└── package.json
```

## Development

The CLI is built using:

- **Express.js** - HTTP server
- **Jay Dev Server** - Core development server functionality
- **Jay Editor Server** - Editor integration server
- **get-port** - Automatic port discovery
- **Vite** - Build tool integration

## Future Enhancements

**Note**: The CLI currently does not accept command-line parameters. This will change in future versions to support:

- Custom pages directory path
- Custom TypeScript configuration file
- Custom output directory
- Additional server configuration options
- Development vs production modes

## Related Packages

- `@jay-framework/dev-server` - Core development server functionality
- `@jay-framework/editor-server` - Editor integration server
- `@jay-framework/stack-client-runtime` - Client-side runtime
- `@jay-framework/stack-server-runtime` - Server-side runtime
- `@jay-framework/fullstack-component` - Full-stack component system
