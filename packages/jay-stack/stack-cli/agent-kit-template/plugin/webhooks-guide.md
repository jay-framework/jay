# Webhooks & Data Change Invalidation

Webhooks let external systems (CMS, database, etc.) notify the renderer server when data changes, triggering targeted rebuilds of affected pages.

## makeWebhook

```typescript
import { makeWebhook } from '@jay-framework/fullstack-component';

export const onProductChange = makeWebhook('wix-stores.product-change')
  .withServices(PRODUCTS_SERVICE)
  .withHandler(async (event, invalidate, productsService) => {
    const slug = await productsService.resolveSlug(event.payload.itemId);
    await invalidate('product-page', { slug });
  });
```

## Builder API

```typescript
makeWebhook('plugin-name.event-name')
  .withServices(SERVICE1, SERVICE2) // Inject services
  .withHandler(async (event, invalidate, svc1, svc2) => {
    // event.type — webhook name
    // event.payload — parsed JSON body from the HTTP request
    // event.headers — HTTP headers
    // invalidate(contractName, params?) — trigger rebuild
  });
```

## The invalidate Function

The `invalidate` callback resolves contract names to routes and rebuilds affected instances:

```typescript
// Rebuild a specific instance — finds routes using 'product-page' contract,
// rebuilds the instance matching { slug: 'blue-widget' }
await invalidate('product-page', { slug: 'blue-widget' });

// Rebuild ALL instances of routes using 'search-results' contract
await invalidate('search-results');
```

**Contract-based, not route-based.** A plugin knows its own contract names but not the project's route structure. The framework resolves which routes use each contract via the `contracts` field in the route manifest.

## Declaring in plugin.yaml

```yaml
webhooks:
  - name: onProductChange
  - name: onInventoryUpdate
```

The `name` field is the **export name** from the plugin module. The webhook URL is derived from the `makeWebhook()` name argument, not the export name.

## URL Mapping

Webhooks are exposed on the renderer server at:

```
POST /_jay/webhooks/{webhookName}
```

Where `{webhookName}` is the first argument to `makeWebhook()`. Example:

```
makeWebhook('wix-stores.product-change')
  → POST /_jay/webhooks/wix-stores.product-change
```

## Optimistic Skip

After re-running the slow render, the framework compares the new pre-rendered jay-html with the existing one. If the template structure is unchanged (e.g., a price change updates ViewState but doesn't toggle a slow conditional), the server element compilation and Vite client build are skipped.

## Project Webhooks

Projects can define webhooks in `src/webhooks/`:

```typescript
// src/webhooks/on-content-update.ts
import { makeWebhook } from '@jay-framework/fullstack-component';

export const onContentUpdate = makeWebhook('cms.content-update').withHandler(
  async (event, invalidate) => {
    const { pageSlug } = event.payload as { pageSlug: string };
    await invalidate('content-page', { slug: pageSlug });
  },
);
```

Project webhooks don't need plugin.yaml — they are discovered by scanning compiled files in `server/webhooks/`.

## CLI Rebuild

For manual or CI-triggered rebuilds without a webhook:

```bash
# By contract — rebuild all routes using this contract
jay-stack rebuild --contract product-page

# By contract + params — rebuild specific instance
jay-stack rebuild --contract product-page --params '{"slug":"blue-widget"}'

# By route — rebuild all instances of a route (useful for pages with page.ts, no contract)
jay-stack rebuild --route /products/[slug]

# By route + params — rebuild specific instance
jay-stack rebuild --route /products/[slug] --params '{"slug":"blue-widget"}'

# By URL — resolve URL to route+params, rebuild that instance
jay-stack rebuild --url /products/blue-widget
```

## Renderer Server

The renderer server (`jay-stack serve --role=renderer`) hosts webhook endpoints and a rebuild API:

```
POST /_jay/webhooks/:name    — Webhook handler (plugin-defined)
POST /_jay/rebuild           — Programmatic rebuild { contract, route, url, params }
GET  /_jay/status            — Health check + build info
```

The `POST /_jay/rebuild` endpoint accepts one of `contract`, `route`, or `url` in the JSON body.
