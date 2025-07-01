# Jay Stack CLI

A command-line interface for running Jay stack applications in development mode.

## Overview

The Jay Stack CLI provides a simple way to start a development server for Jay applications. It automatically configures and runs the Jay development server with sensible defaults, making it easy to get started with Jay stack development.

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

This will start the development server with default configuration.

### Environment Variables

The CLI supports the following environment variables:

- `PORT` - The port to run the server on (default: `5173`)
- `BASE` - The base path for the server (default: `/`)

Example:

```bash
PORT=3000 BASE=/app @jay-framework/@jay-framework/jay-cli
```

## Default Configuration

The CLI uses the following default configuration:

- **Pages Directory**: `./src/pages` - All Jay pages should be placed in this directory
- **TypeScript Config**: `./tsconfig.json` - Uses the project's TypeScript configuration
- **Output Directory**: `build/@jay-framework/runtime` - Compiled Jay runtime files
- **Server Port**: `5173` (or `PORT` environment variable)
- **Base Path**: `/` (or `BASE` environment variable)

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
├── tsconfig.json                   # TypeScript configuration
└── package.json
```

## Development

The CLI is built using:

- **Express.js** - HTTP server
- **Jay Dev Server** - Core development server functionality
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
- `@jay-framework/stack-client-runtime` - Client-side runtime
- `@jay-framework/stack-server-runtime` - Server-side runtime
- `@jay-framework/fullstack-component` - Full-stack component system
