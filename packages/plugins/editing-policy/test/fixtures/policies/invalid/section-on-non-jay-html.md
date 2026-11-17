---
version: 1
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
    - selector: 'src/styles/app.css#brand'
      rules: { css: yes }
---

# Policy using a #name section on a non-.jay-html file
