---
version: 1
roles:
  client:
    - selector: 'src/pages/**'
      rules: { content: yes }
---

# Policy with a role that has no "**" fallback selector
