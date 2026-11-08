---
version: 1
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
    - selector: 'src/pages/**'
      rules: { dependencies: yes }
---

# Policy using `dependencies` on a selector that cannot match package.json
