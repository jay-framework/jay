# Mood Tracker Plugin

A Jay Stack plugin that provides a mood tracking component with server-side analytics and client-side configuration.

## Features

- **Mood Tracker Component** - Interactive widget with happy, neutral, and sad moods
- **Server Actions** - `submitMood`, `getMoodStats`, `clearMoodHistory` for persistence
- **Plugin Initialization** - Consolidated server/client init using `makeJayInit`

## Installation

```bash
npm install example-jay-mood-tracker-plugin
```

## Usage

### 1. Add to your page

```html
<!-- page.jay-html -->
<div>
  <MoodTracker from="example-jay-mood-tracker-plugin" as="moodTracker" />
</div>
```

### 2. Access the component context (optional)

Components can access the mood tracker configuration via context:

```typescript
import { useContext } from '@jay-framework/runtime';
import { MOOD_TRACKER_CONFIG_CONTEXT } from 'example-jay-mood-tracker-plugin';

// In your component
const config = useContext(MOOD_TRACKER_CONFIG_CONTEXT);
// { analyticsEnabled: true, trackingEndpoint: '/api/mood-analytics' }
```

## Plugin Initialization

This plugin uses the `makeJayInit` pattern - a single file that defines both server and client initialization with automatic type flow.

### Consolidated Init (`lib/init.ts`)

```typescript
import { makeJayInit } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { registerGlobalContext } from '@jay-framework/runtime';
import { createJayContext } from '@jay-framework/runtime';

// Context for client components
export const MOOD_TRACKER_CONFIG_CONTEXT = createJayContext<MoodTrackerConfig>();

export const init = makeJayInit()
  .withServer(async () => {
    // Server-only: register services, load config
    const config = loadConfig();
    registerService(MOOD_ANALYTICS_SERVICE, createAnalyticsService(config));

    // Return data to send to client (typed!)
    return {
      analyticsEnabled: config.enabled,
      trackingEndpoint: config.endpoint,
    };
  })
  .withClient((data) => {
    // data is typed from withServer return type!
    registerGlobalContext(MOOD_TRACKER_CONFIG_CONTEXT, data);
  });
```

**Benefits:**

- ✅ Single file - no separate server/client init files
- ✅ Automatic type flow - client receives typed data from server
- ✅ Compiler splits code - server code never reaches client bundle
- ✅ Consistent with `makeJayStackComponent` pattern

### Plugin Manifest (`plugin.yaml`)

```yaml
name: mood-tracker-plugin
contracts:
  - name: mood-tracker
    contract: mood-tracker.jay-contract
    component: moodTracker

actions:
  - submitMood
  - getMoodStats
  - clearMoodHistory
# Init is auto-discovered at lib/init.ts
# For compiled NPM packages, specify the export name:
# init: moodTrackerInit
```

## Server-to-Client Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    lib/init.ts (single file)                        │
├─────────────────────────────────────────────────────────────────────┤
│  export const init = makeJayInit()                                  │
│      .withServer(async () => {                                      │
│          // runs on server                                          │
│          return { analyticsEnabled: true, ... };  ──────┐           │
│      })                                                 │           │
│      .withClient((data) => {  // data is typed! ◄───────┘           │
│          registerGlobalContext(CONFIG_CONTEXT, data);               │
│      });                                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
         Server Bundle                         Client Bundle
    (withServer code only)                (withClient code only)
```

## Environment Variables

| Variable                  | Default               | Description                  |
| ------------------------- | --------------------- | ---------------------------- |
| `MOOD_ANALYTICS_ENABLED`  | `true`                | Enable/disable mood tracking |
| `MOOD_ANALYTICS_ENDPOINT` | `/api/mood-analytics` | Analytics API endpoint       |
| `MOOD_RETENTION_DAYS`     | `30`                  | Days to retain mood data     |

## Exports

### Init

- `init` - The makeJayInit initialization object

### Components

- `moodTracker` - The mood tracker full-stack component

### Services (Server)

- `MOOD_ANALYTICS_SERVICE` - Service marker for analytics
- `MoodAnalyticsService` - Service interface type

### Contexts (Client)

- `MOOD_TRACKER_CONFIG_CONTEXT` - Context marker for config
- `MoodTrackerConfig` - Config interface type

### Actions

- `submitMood({ mood })` - Record a mood event
- `getMoodStats()` - Get mood statistics
- `clearMoodHistory()` - Clear all mood data
