# Jay Stack Editor Protocol: Project Configuration API

## Overview

The Jay Stack Editor Protocol now includes a new `getProjectConfiguration` request that allows third-party developers to retrieve comprehensive information about a Jay project, including its structure, pages, components, and installed applications.

## API Reference

### Request

```typescript
interface GetProjectConfigurationMessage {
    type: 'getProjectConfiguration';
}
```

### Response

```typescript
interface GetProjectConfigurationResponse {
    type: 'getProjectConfiguration';
    success: boolean;
    error?: string;
    configuration: ProjectConfiguration;
}
```

### Data Structures

#### ProjectConfiguration
```typescript
interface ProjectConfiguration {
    name: string;           // Project name from project.conf.yaml
    localPath: string;      // Absolute path to project on local machine
    pages: ProjectPage[];   // All pages in the project
    components: ProjectComponent[];  // All components in the project
    installedApps: InstalledApp[];  // Installed third-party applications
}
```

#### ProjectPage
```typescript
interface ProjectPage {
    name: string;           // Page name (derived from directory)
    url: string;            // URL route (e.g., "/", "/products/:id")
    filePath: string;       // Absolute path to page.jay-html file
    usedComponents: {       // Headless components used by this page
        contract: string;   // Path to contract file
        src: string;        // Source module name
        name: string;       // Component name
        key: string;        // Data binding key
    }[];
}
```

#### ProjectComponent
```typescript
interface ProjectComponent {
    name: string;           // Component name
    filePath: string;       // Absolute path to component file
    contractPath?: string;  // Path to contract file (if exists)
}
```

#### InstalledApp
```typescript
interface InstalledApp {
    name: string;           // App display name
    module: string;         // Module name
    pages: {                // App-defined pages
        name: string;
        headless_components: {
            name: string;
            key: string;
            contract: string;
            slugs?: string[];
        }[];
    }[];
    components: {           // App-defined components
        name: string;
        headless_components: {
            name: string;
            key: string;
            contract: string;
        }[];
    }[];
    config_map?: {          // App configuration options
        display_name: string;
        key: string;
    }[];
}
```

## Usage Examples

### Basic Usage with Editor Client

```typescript
import { createEditorClient } from '@jay-framework/editor-client';

const client = createEditorClient();
await client.connect();

// Request project configuration
const response = await client.getProjectConfiguration({
    type: 'getProjectConfiguration'
});

if (response.success) {
    const config = response.configuration;
    console.log(`Project: ${config.name}`);
    console.log(`Location: ${config.localPath}`);
    console.log(`Pages: ${config.pages.length}`);
    console.log(`Components: ${config.components.length}`);
    console.log(`Installed Apps: ${config.installedApps.length}`);
} else {
    console.error('Failed to get configuration:', response.error);
}
```

### Analyzing Project Structure

```typescript
// Get all pages and their used components
const { configuration } = await client.getProjectConfiguration({
    type: 'getProjectConfiguration'
});

configuration.pages.forEach(page => {
    console.log(`Page: ${page.name} (${page.url})`);
    
    page.usedComponents.forEach(component => {
        console.log(`  Uses: ${component.src}/${component.name} as ${component.key}`);
    });
});
```

### Working with Installed Apps

```typescript
// Find all headless components provided by installed apps
const { configuration } = await client.getProjectConfiguration({
    type: 'getProjectConfiguration'
});

configuration.installedApps.forEach(app => {
    console.log(`App: ${app.name}`);
    
    // List available page components
    app.pages.forEach(page => {
        console.log(`  Page: ${page.name}`);
        page.headless_components.forEach(comp => {
            console.log(`    Component: ${comp.name} (${comp.contract})`);
        });
    });
    
    // List available standalone components
    app.components.forEach(component => {
        console.log(`  Component: ${component.name}`);
        component.headless_components.forEach(comp => {
            console.log(`    Provides: ${comp.name} (${comp.contract})`);
        });
    });
});
```

### Building a Project Explorer

```typescript
async function exploreProject() {
    const response = await client.getProjectConfiguration({
        type: 'getProjectConfiguration'
    });
    
    if (!response.success) {
        throw new Error(response.error);
    }
    
    const { configuration } = response;
    
    return {
        projectInfo: {
            name: configuration.name,
            path: configuration.localPath,
            stats: {
                pages: configuration.pages.length,
                components: configuration.components.length,
                installedApps: configuration.installedApps.length
            }
        },
        
        // Create a map of all available headless components
        availableComponents: configuration.installedApps.flatMap(app => 
            app.components.flatMap(comp => 
                comp.headless_components.map(hc => ({
                    app: app.name,
                    name: hc.name,
                    contract: hc.contract,
                    key: hc.key
                }))
            )
        ),
        
        // Analyze component usage across pages
        componentUsage: configuration.pages.reduce((usage, page) => {
            page.usedComponents.forEach(comp => {
                const key = `${comp.src}/${comp.name}`;
                usage[key] = (usage[key] || 0) + 1;
            });
            return usage;
        }, {} as Record<string, number>)
    };
}
```

## Error Handling

The API includes comprehensive error handling:

```typescript
try {
    const response = await client.getProjectConfiguration({
        type: 'getProjectConfiguration'
    });
    
    if (!response.success) {
        // Handle specific errors
        console.error('Configuration error:', response.error);
        
        // Partial data may still be available
        if (response.configuration) {
            console.log('Partial configuration available');
        }
    }
} catch (error) {
    // Handle connection or protocol errors
    console.error('Protocol error:', error);
}
```

## Integration Notes

### File System Structure
The API expects the following Jay project structure:
```
project-root/
├── config/
│   ├── project.conf.yaml
│   └── installedApps/
│       └── <app-name>/
│           └── app.conf.yaml
├── src/
│   ├── pages/
│   │   ├── page.jay-html
│   │   └── [dynamic]/
│   │       └── page.jay-html
│   └── components/
│       ├── Component.jay-html
│       └── Component.jay-contract
```

### Headless Component Detection
The API automatically parses `jay-html` files to detect headless components by looking for:
```html
<script type="application/jay-headless"
        contract="path/to/contract.jay-contract"
        src="module-name"
        name="componentName"
        key="dataKey">
</script>
```

### Performance Considerations
- The API scans the entire project structure on each request
- For large projects, consider caching the response
- File system operations are performed asynchronously
- Malformed configuration files are handled gracefully

## Requirements

- Jay Stack CLI running with editor server enabled
- Editor client connected to the dev server
- Project must follow Jay Stack conventions for directory structure

This API enables powerful tooling scenarios like project explorers, component browsers, dependency analyzers, and automated project documentation generators.
