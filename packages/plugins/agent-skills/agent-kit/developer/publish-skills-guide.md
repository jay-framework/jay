# Publishing Agent Skills

The `agent-skills` plugin publishes focused agent capabilities as `SKILL.md` files at the
well-known path `/.well-known/agent-skills/`, following
[agent-skills-discovery v0.2.0](https://specification.website/spec/agent-readiness/agent-skills-discovery.md).
Agents that visit your site discover these skills and load them to learn how to use it.

## Published skills vs. authoring skills — don't confuse them

- **Authoring skills** (`.cursor/skills/*`, the `agent-kit/*` guides) teach a dev-time agent how to
  **build** a Jay site. They are consumed locally and are **never published**.
- **Published skills** (this guide) are what your built **website exposes** for agents that
  **consume** the site. They live under **`src/skills/`** — a sibling of `src/pages`,
  `src/components`, `src/styles`.

Do **not** point the publisher at `.cursor/skills`.

## Author a skill

Create `src/skills/<name>/SKILL.md` with YAML frontmatter:

```markdown
---
name: jay
description: Build a website with the Jay framework
---

# Build a website with Jay

Step-by-step instructions the agent should follow…
```

- `name` — lowercase letters, digits, hyphens, 1–64 chars (must match the folder's purpose).
- `description` — ≤1024 chars; agents use it to decide whether to load the skill.

Any sibling files in the skill folder (images, data, example files) are **assets**: the publisher
bundles `SKILL.md` + assets into a `.tar.gz` archive for that skill.

## Publish

```bash
jay-stack run agent-skills/publish-skills                 # folder mode: reads src/skills/
jay-stack run agent-skills/publish-skills --folder path   # custom source folder
jay-stack run agent-skills/publish-skills --config skills.yaml   # curated list
```

This writes, under `public/.well-known/agent-skills/`:

| Output                 | Contents                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `<name>/SKILL.md`      | the authored skill, served at a predictable path            |
| `<name>/<name>.tar.gz` | only when the skill ships assets (`type: "archive"`)        |
| `index.json`           | every skill with `name`/`type`/`description`/`url`/`digest` |
| `../api-catalog`       | a linkset advertising the index (RFC 9727)                  |

Each `index.json` entry carries a **`digest`** = `sha256:<hex>` over the served artifact's bytes. A
compliant agent refetches the `url`, hashes it, and **refuses** the skill if the hash doesn't match.

The publisher rebuilds the whole `agent-skills/` tree each run, so a skill you delete from
`src/skills/` disappears from the published output.

### Config mode

For curated/selective publishing, pass `--config <file>` (JSON or YAML):

```yaml
skills:
  - name: jay
    description: Build a website with the Jay framework
    source: ../src/skills/jay/SKILL.md # path to a SKILL.md (relative to the config file)
    assets:
      - ../src/skills/jay/diagram.png
  - name: inline
    description: A small inline skill
    body: | # inline SKILL.md instead of `source`
      ---
      name: inline
      description: A small inline skill
      ---
      Instructions…
```

## Keep it fresh — the validator is your tripwire

`jay-stack validate` checks the published tree:

- **error** — a `digest` doesn't match the served file (you edited a `SKILL.md` or asset and forgot
  to re-publish), the index is malformed, or `$schema`/entry fields are wrong.
- **warning** — no `index.json` yet, or the `api-catalog` advertisement is missing.

When validation reports a digest mismatch, **re-run `jay-stack run agent-skills/publish-skills`** —
that recomputes the digests and clears the failure.

## Serving

Files under `public/.well-known/` are served at `/.well-known/*` in both dev and production. Jay
sets the response headers the spec expects out of the box (DL#217): `Access-Control-Allow-Origin: *`
on every `/.well-known/*` response, `SKILL.md` as `text/markdown`, skill archives as
`application/gzip`, and `index.json` as `application/json`. No extra configuration is required.

If you front the site with a CDN/reverse proxy that strips or overrides headers, make sure it
preserves the CORS header and content-types above.
