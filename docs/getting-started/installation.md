# Installation Guide

This guide covers how to install and set up Jay for different types of projects and development environments.

## Prerequisites

Before installing Jay, ensure you have:

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **npm or yarn** - Package managers (npm comes with Node.js)
- **TypeScript** - For type safety (recommended)

## Installation Options

### Option 1: New Project Setup

For a completely new Jay project:

```bash
# Create a new directory
mkdir my-jay-project
cd my-jay-project

# Initialize a new npm project
npm init -y

# Install Jay core packages
npm install @jay-framework/component @jay-framework/runtime

# Install development dependencies
npm install --save-dev typescript @types/node
```

### Option 2: Adding to Existing Project

To add Jay to an existing project:

```bash
# Navigate to your project directory
cd your-existing-project

# Install Jay packages
npm install @jay-framework/component @jay-framework/runtime

# Install TypeScript if not already present
npm install --save-dev typescript @types/node
```

### Option 3: Using Jay Stack (Full-Stack)

For full-stack applications with server-side rendering:

```bash
# Install Jay Stack packages
npm install @jay-framework/fullstack-component jay-stack-dev-server

# Install additional dependencies for full-stack development
npm install --save-dev @types/node typescript
```

## Package Overview

### Core Packages

| Package                        | Description                  | When to Use                     |
| ------------------------------ | ---------------------------- | ------------------------------- |
| `@jay-framework/component`     | Core component library       | All Jay projects                |
| `@jay-framework/runtime`       | Runtime utilities and types  | All Jay projects                |
| `@jay-framework/reactive`      | Reactive state management    | When using signals and effects  |
| `@jay-framework/serialization` | Data serialization utilities | When working with external data |

### Full-Stack Packages

| Package                              | Description                  | When to Use            |
| ------------------------------------ | ---------------------------- | ---------------------- |
| `@jay-framework/fullstack-component` | Full-stack component builder | Server-side rendering  |
| `jay-stack-dev-server`               | Development server           | Full-stack development |
| `@jay-framework/stack-route-scanner` | Route discovery              | File-based routing     |

### Build Tools

| Package                                  | Description        | When to Use           |
| ---------------------------------------- | ------------------ | --------------------- |
| `@@jay-framework/compiler/vite-plugin`   | Vite integration   | Vite-based projects   |
| `@@jay-framework/compiler/rollup-plugin` | Rollup integration | Rollup-based projects |
| `@@jay-framework/compiler/cli`           | Command-line tools | All projects          |

## Configuration

### TypeScript Configuration

Create a `tsconfig.json` file in your project root:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "**/*.jay-html"],
  "exclude": ["node_modules", "dist"]
}
```

### Vite Configuration

For Vite-based projects, create a `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import jay from '@@jay-framework/compiler/vite-plugin';

export default defineConfig({
  plugins: [
    jay({
      // Plugin options
      include: ['**/*.jay-html'],
      exclude: ['node_modules/**'],
    }),
  ],
  resolve: {
    extensions: ['.ts', '.js', '.jay-html'],
  },
});
```

### Rollup Configuration

For Rollup-based projects, create a `rollup.config.js`:

```javascript
import jay from '@@jay-framework/compiler/rollup-plugin';

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/bundle.js',
    format: 'es',
  },
  plugins: [
    jay({
      include: ['**/*.jay-html'],
    }),
  ],
};
```

## Development Environment Setup

### VS Code Setup

Install the recommended extensions:

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode"
  ]
}
```

### IntelliJ IDEA Setup

For IntelliJ IDEA users:

1. Install the TypeScript plugin
2. Configure the TypeScript compiler settings
3. Copy the run configurations from the dev environment:

```bash
cp -r dev-environment/editor-setup/idea .idea/
```

### Project Structure

Recommended project structure:

```
my-jay-project/
├── src/
│   ├── components/
│   │   ├── counter/
│   │   │   ├── counter.jay-html
│   │   │   └── counter.ts
│   │   └── ...
│   ├── pages/
│   │   └── ...
│   └── main.ts
├── public/
│   └── index.html
├── dist/
├── package.json
├── tsconfig.json
└── vite.config.ts (or rollup.config.js)
```

## Build Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "jay:definitions": "@jay-framework/@jay-framework/jay-cli definitions src"
  }
}
```

## Environment Variables

Create a `.env` file for environment-specific configuration:

```env
# Development
NODE_ENV=development
JAY_DEBUG=true

# Production
NODE_ENV=production
JAY_DEBUG=false
```

## Troubleshooting

### Common Installation Issues

#### TypeScript Errors

If you see TypeScript errors about missing types:

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check TypeScript version compatibility
npm list typescript
```

#### Build Tool Integration

If build tools aren't recognizing Jay files:

1. Ensure the appropriate plugin is installed
2. Check plugin configuration in your build config
3. Verify file extensions are included in the build process

#### Module Resolution

If modules can't be resolved:

```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Performance Optimization

For production builds:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    target: 'esnext',
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          jay: ['@jay-framework/component', '@jay-framework/runtime'],
        },
      },
    },
  },
});
```

## Next Steps

After installation:

1. **Follow the Quick Start Guide** - Build your first component
2. **Explore Examples** - See working code patterns
3. **Read the Core Documentation** - Understand Jay-HTML and contracts
4. **Set Up Your IDE** - Configure your development environment

## Support

If you encounter issues during installation:

- Check the [troubleshooting section](#troubleshooting)
- Review the [examples](../examples/) for working configurations
- Report issues on the GitHub repository
- Join community discussions for help

---

Ready to start building? Head to the [Quick Start Guide](./quick-start.md) to create your first Jay component!
