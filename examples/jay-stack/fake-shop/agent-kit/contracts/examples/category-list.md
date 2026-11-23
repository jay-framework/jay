# Example: Category List

A medium-complexity contract with props and a repeated sub-contract. Shows how to configure a component at design time.

```yaml
name: category-list
description: Displays store categories. Use for category navigation grids and menus.
props:
  - name: parentCategory
    type: string
    description: Parent category slug. Only direct children of this category are shown.
tags:
  - tag: categories
    type: sub-contract
    repeated: true
    trackBy: _id
    description: List of visible store categories
    tags:
      - tag: _id
        type: data
        dataType: string

      - tag: name
        type: data
        dataType: string
        required: true

      - tag: slug
        type: data
        dataType: string

      - tag: description
        type: data
        dataType: string

      - tag: productCount
        type: data
        dataType: number

      - tag: imageUrl
        type: data
        dataType: string
        meta: { mediaType: wix-image }

      - tag: categoryLink
        type: interactive
        elementType: HTMLAnchorElement

  - tag: hasCategories
    type: variant
    dataType: boolean
    description: Whether there are any categories
```

## Why these choices

- **`props` instead of `params`** — this is a widget placed on a page, not a page itself. The parent decides which categories to show.
- **No explicit phases** — category data is static and available at all phases.
- **`trackBy: _id`** — each category has a stable GUID for efficient list diffing.
- **`hasCategories` variant** — lets the template show an empty state without checking array length.
- **`meta: { mediaType: wix-image }`** — tells validators this string is a Wix media URL.

## Jay-HTML usage

```html
<jay:category-list parentCategory="shop">
  <div if="hasCategories" class="category-grid">
    <div forEach="categories" trackBy="_id">
      <a ref="categoryLink" class="category-card">
        <img src="{imageUrl}" alt="{name}" />
        <span>{name}</span>
        <span class="count">({productCount})</span>
      </a>
    </div>
  </div>
</jay:category-list>
```
