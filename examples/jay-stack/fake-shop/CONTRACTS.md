# Fake Shop Contract Files

This document explains the contract files used in the fake-shop example and the reasoning behind the rendering phase assignments.

## Overview

Contract files (`.jay-contract`) define the interface between component logic and UI implementations. They specify:

- **View State**: Data that flows from component logic to UI
- **References**: Named UI elements for interaction (buttons, inputs, etc.)
- **Rendering Phases**: When each property is rendered (slow, fast, or fast+interactive)

## Rendering Phases

### Slow Phase (Build Time)

Properties marked as `slow` are rendered at **build time** or when static data changes. These values don't change per request.

**Use for:**

- Product catalog data
- Static content (names, descriptions, SKUs)
- Data that rarely changes

### Fast Phase (Request Time)

Properties marked as `fast` are rendered at **request time** on the server. These values can change per request but are not modifiable on the client.

**Use for:**

- Inventory status
- Current prices (if dynamic)
- User-specific content
- Calculated values (totals, taxes)

### Fast+Interactive Phase (Request Time + Client)

Properties marked as `fast+interactive` are initially rendered at **request time** but can be **modified on the client**.

**Use for:**

- Shopping cart items
- Form inputs
- User selections
- Client-modifiable data

## Contract Files

### 1. Homepage (`src/pages/page.jay-contract`)

Currently empty as the homepage only uses a headless mood tracker component. In a real e-commerce site, this could include:

- Featured products (slow phase)
- Promotional banners (slow phase)
- User-specific recommendations (fast phase)

### 2. Products List Page (`src/pages/products/page.jay-contract`)

```yaml
tags:
  - tag: products
    type: sub-contract
    repeated: true
    phase: slow # Product catalog is static
```

**Rationale:**

- Product catalog is loaded at build time
- Products rarely change, making them ideal for static generation
- All product properties (name, price, sku, id, slug) are slow

### 3. Product Detail Page (`src/pages/products/[slug]/page.jay-contract`)

```yaml
tags:
  # Slow phase - static product info
  - tag: name, price, sku, id, type
    phase: slow

  # Fast phase - dynamic inventory
  - tag: inStock
    phase: fast
```

**Rationale:**

- **Product information** (name, price, SKU) is static and can be pre-rendered at build time
- **Inventory status** (`inStock`) is dynamic and checked per request against the inventory service
- This separation enables:
  - Fast initial page load (static HTML with product info)
  - Up-to-date inventory status on each request
  - CDN caching of static content

### 4. Shopping Cart Page (`src/pages/cart/page.jay-contract`)

```yaml
tags:
  - tag: cartItems
    phase: fast+interactive # User can add/remove items

  - tag: totalAmount
    phase: fast # Calculated, but not directly modifiable
```

**Rationale:**

- **Cart items** are `fast+interactive` because users can add/remove items on the client
- **Total amount** is `fast` (not interactive) because it's calculated from cart items, not directly modified
- All cart item properties must be `fast+interactive` since the array is mutable

### 5. Checkout Page (`src/pages/checkout/page.jay-contract`)

```yaml
tags:
  - tag: shippingAddress
    phase: fast+interactive # User fills in form

  - tag: orderSummary
    phase: fast # Calculated values
```

**Rationale:**

- **Shipping address** is `fast+interactive` because users fill in the form fields on the client
- **Order summary** (subtotal, tax, shipping, total) is `fast` because it's calculated server-side but not directly editable

### 6. Thank You Page (`src/pages/thankyou/page.jay-contract`)

```yaml
tags:
  - tag: orderId, orderDate, estimatedDelivery, totalAmount, customerEmail
    phase: fast # Order-specific data
```

**Rationale:**

- All order confirmation data is `fast` because it's specific to the completed order
- Loaded at request time from order data
- No interactive data needed (confirmation page is read-only)

## Phase Assignment Guidelines

### Choose `slow` when:

- Data rarely changes
- Same for all users
- Can be pre-rendered at build time
- Example: Product catalog, static content

### Choose `fast` when:

- Data changes per request
- User-specific or dynamic
- Not modifiable on client
- Example: Inventory status, calculated totals

### Choose `fast+interactive` when:

- Data can be modified by user on client
- Form inputs
- Shopping cart items
- User selections
- Example: Cart items, form fields

## Best Practices

1. **Start with `slow`**: Most e-commerce data is static (product info, images, descriptions)
2. **Use `fast` for dynamic lookups**: Inventory, pricing, user-specific data
3. **Use `fast+interactive` sparingly**: Only for data users can modify
4. **Group related data**: Keep related properties in the same phase when possible
5. **Document your choices**: Add `description` fields to explain phase decisions

## Related Documentation

- [Contract Files](/jay/docs/core/contract-files.md)
- [Jay Stack Components](/jay/docs/core/jay-stack.md)
- Design Log #49: Full Stack Component Rendering Manifest
- Design Log #50: Rendering Phases in Contracts
- Design Log #51: Jay HTML with Contract References
