---
version: 1
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
    - rules: { content: yes }
---

# Policy with a role entry that has no selector
