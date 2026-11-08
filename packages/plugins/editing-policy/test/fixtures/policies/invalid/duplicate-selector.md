---
version: 1
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
    - selector: 'src/pages/**'
      rules: { content: yes }
    - selector: 'src/pages/**'
      rules: { design: yes }
---

# Policy with a duplicate selector in one role
