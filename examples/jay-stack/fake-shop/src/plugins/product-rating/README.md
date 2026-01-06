# Product Rating Plugin (Local)

A local Jay Stack plugin that provides a product rating widget with server-side ratings storage.

## Features

- **Rating Stars** - Interactive star rating widget
- **Server Actions** - `submitRating`, `getRatings` for persistence
- **Plugin Initialization** - Uses `makeJayInit` for consolidated server/client init

## Usage

### 1. Add to your page

```html
<!-- page.jay-html -->
<ProductRating from="./plugins/product-rating" as="productRating" />
```

### 2. Access the configuration (optional)

```typescript
import { useContext } from '@jay-framework/runtime';
import { RATING_UI_CONFIG_CONTEXT } from './plugins/product-rating/init';

const config = useContext(RATING_UI_CONFIG_CONTEXT);
// { maxStars: 5, allowHalfStars: false, ... }
```

## Plugin Initialization

Uses the `makeJayInit` pattern for consolidated server/client initialization:

```typescript
// init.ts
export const init = makeJayInit()
  .withServer(async () => {
    registerService(RATINGS_SERVICE, createRatingsService());
    return {
      maxStars: 5,
      allowHalfStars: false,
      showReviewCount: true,
      enableRatingSubmission: true,
    };
  })
  .withClient((data) => {
    registerGlobalContext(RATING_UI_CONFIG_CONTEXT, data);
  });
```

## Exports

- `init` - The makeJayInit initialization object
- `RATINGS_SERVICE` - Server-side ratings service marker
- `RATING_UI_CONFIG_CONTEXT` - Client-side configuration context
- `productRating` - The full-stack component
