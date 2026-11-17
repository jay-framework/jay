---
version: 1
roles:
  client:
    - selector: '**'
      rules: { content: yes, create: from-template }
---

# Policy using create: from-template when no component matches the templates globs
