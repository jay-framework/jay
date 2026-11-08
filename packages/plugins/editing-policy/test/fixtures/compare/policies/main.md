---
version: 1
defaultRole: client
templates: ["src/components/templates/**"]
roles:
  developer:
    - selector: "**"
      rules: { code: yes, css: yes, content: yes, design: yes, dependencies: yes, config: yes,
               create: yes, delete: yes, rename: yes, policy: yes, publish: direct }
  designer:
    - selector: "**"
      rules: { design: yes, css: yes, content: yes, create: yes,
               code: no, dependencies: no, config: no, delete: no, rename: no,
               policy: yes, publish: direct }
    - selector: "jay-policy.md"
      rules: { policy: no, onViolation: block }
  client:
    - selector: "**"
      rules: { code: no, css: no, config: no, dependencies: no, content: yes,
               design: designSystemOnly, create: from-template, delete: no, rename: no,
               publish: review, onViolation: review }
    - selector: "src/components/templates/**"
      rules: { edit: no, onViolation: block }
    - selector: "src/pages/legal/**"
      rules: { edit: no, onViolation: block }
---

# Editing policy

Clients may edit content and swap design-system elements. Designers own layout and templates.
Developers have full access.
