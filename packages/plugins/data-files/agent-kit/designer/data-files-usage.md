# Data Files Plugin

Render structured data from CSV, YAML, JSON, or JSONL files as lists, item pages, or single items.

## When to Use

| Use case                                                      | Plugin                        |
| ------------------------------------------------------------- | ----------------------------- |
| Small/medium static datasets (team, FAQ, features, changelog) | **data-files**                |
| Large, frequently updated catalogs (products, blog posts)     | CMS plugin (e.g., wix-stores) |
| Content-heavy pages (documentation, articles)                 | markdown plugin               |

Data files require a **full route rebuild** when data changes. CMS plugins support single-item invalidation. Choose data-files when your data is small, changes infrequently, and doesn't need an API.

## End-to-End Workflow

1. **Place data** — put CSV/YAML/JSON/JSONL files in a content directory
2. **Define schema** — create a `.jay-contract` schema file (or run `jay-stack run data-files/generate-schema`)
3. **Generate agent-kit** — run `jay-stack agent-kit` to materialize component contracts
4. **Use in templates** — import the plugin with the materialized contract name
5. **Build** — data is read at render time, cross-references resolved

```
project/
├── content/
│   ├── team/
│   │   ├── data.csv          # the data
│   │   └── team.jay-contract # the schema
│   └── faq/
│       ├── data.yaml
│       └── faq.jay-contract
├── src/pages/
│   ├── team/
│   │   ├── page.jay-html     # list view
│   │   └── [slug]/
│   │       └── page.jay-html # per-item page
│   └── faq/
│       └── page.jay-html     # FAQ list
```

## Data Formats

| Extension        | Format                | Notes                                                              |
| ---------------- | --------------------- | ------------------------------------------------------------------ |
| `.csv`           | CSV with header row   | All values are strings                                             |
| `.yaml` / `.yml` | YAML array of objects | Types inferred (string, number, boolean); nested objects supported |
| `.json`          | JSON array of objects | Types inferred; nested objects supported                           |
| `.jsonl`         | JSON Lines            | One object per line                                                |

## Schema Contract

Every data directory requires a `.jay-contract` schema file. This is the standard contract format — the same syntax used for page and component contracts.

```yaml
# content/team/team.jay-contract
name: team
description: Team members
tags:
  - tag: slug
    type: data
    dataType: string
    meta:
      slug: 'true' # marks the slug field for routing
  - tag: name
    type: data
    dataType: string
  - tag: role
    type: data
    dataType: string
  - tag: bio
    type: data
    dataType: html-string # rendered HTML content
```

**Required:** one tag must have `meta.slug: "true"` — this is the item identifier for routing and lookup.

If no schema exists, validation emits an error with instructions to create one.

## Three Components

### `data-pages` — per-item pages

Each row becomes a page. Use with `[slug]` dynamic routes.

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/data-files"
    contract="team-data-pages"
    key="member"
  >
    contentDir: content/team
    file: data.csv
  </script>
</head>
<body>
  <h1>{member.name}</h1>
  <p>{member.role}</p>
  <div>{member.bio}</div>
</body>
```

### `data-list` — all items as a list

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/data-files"
    contract="team-data-list"
    key="team"
  >
    contentDir: content/team
    file: data.csv
  </script>
</head>
<body>
  <ul>
    <li forEach="team.items" trackBy="slug">
      <a href="/team/{slug}">{name} — {role}</a>
    </li>
  </ul>
</body>
```

### `data-item` — single item by slug

```html
<jay:team-data-item slug="jane" contentDir="content/team" file="data.csv">
  <div class="card">
    <h3>{name}</h3>
    <p>{role}</p>
  </div>
</jay:team-data-item>
```

## Contract Names

The materialized contract names combine the schema name with the component type:

| Schema name | Component  | Contract name     |
| ----------- | ---------- | ----------------- |
| `team`      | data-pages | `team-data-pages` |
| `team`      | data-list  | `team-data-list`  |
| `team`      | data-item  | `team-data-item`  |

**Important:** use the materialized contract names (e.g., `team-data-pages`), not the schema contract file directly.

## Cross-References

Link to items in other data files using contract `link`:

```yaml
# content/recipes/recipes.jay-contract
tags:
  - tag: author
    type: sub-contract
    link: ../team/team.jay-contract
```

In the data file, the field value is the slug of the referenced item:

```yaml
- slug: carbonara
  title: Pasta Carbonara
  author: jane # resolved from team data by slug
```

The plugin resolves the reference at render time — the designer gets `{author.name}` directly.

**Inline vs reference:** if the data value is a string, it's a slug reference (resolved from the linked data file). If it's an object, it's inline data (used directly).

## Nested Objects

Use inline sub-contracts for nested data:

```yaml
# Schema
- tag: nutrition
  type: sub-contract
  tags:
    - tag: calories
      type: data
      dataType: number

# Data
- slug: carbonara
  nutrition:
    calories: 450
```

## Limitations

- **Size limit:** data files are for datasets under 10,000 rows. Larger files emit a warning — use a CMS plugin instead.
- **Full rebuild:** changing any row triggers a rebuild of all pages using that file. CMS plugins support single-item updates.
- **No circular references:** A referencing B referencing A is detected and rejected.
- **Slug only:** only slug-based routing is supported. Filtering, sorting, and categories require a CMS plugin.

## Pre-Build Script Pattern

For data sourced from external systems, use a pre-build script:

```bash
#!/bin/bash
# scripts/fetch-data.sh
curl -s https://api.example.com/team | jq '.' > content/team/data.json
curl -s https://api.example.com/faq | jq '.' > content/faq/data.json
```

Run before `jay-stack agent-kit` and `jay-stack build`. The data files are local snapshots — the plugin reads them at build time without network access.
