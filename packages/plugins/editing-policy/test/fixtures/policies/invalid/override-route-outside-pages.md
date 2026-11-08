---
version: 1
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
    - selector: 'src/components/**'
      rules: { overrideRoute: any }
---

# Policy using `overrideRoute` outside src/pages
