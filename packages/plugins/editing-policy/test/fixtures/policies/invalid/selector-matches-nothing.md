---
version: 1
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
    - selector: 'src/pages/ghost/**'
      rules: { content: yes }
---

# Policy with a selector that matches no file in the project
