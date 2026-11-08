---
version: 1
defaultRole: ghost
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
---

# Policy whose defaultRole names an undefined role
