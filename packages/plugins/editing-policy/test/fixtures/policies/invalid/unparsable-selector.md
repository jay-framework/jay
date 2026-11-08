---
version: 1
roles:
  developer:
    - selector: '**'
      rules: { code: yes }
    - selector: 'src/pages/page.jay-html#a#b'
      rules: { content: yes }
---

# Policy with an unparsable selector (two '#')
