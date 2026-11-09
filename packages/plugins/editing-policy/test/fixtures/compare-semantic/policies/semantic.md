---
version: 1
defaultRole: client
templates: ['components/templates/**']
roles:
  client:
    - selector: '**'
      rules:
        {
          content: yes,
          design: designSystemOnly,
          create: from-template,
          code: no,
          publish: direct,
          onViolation: review,
        }
---

# Semantic policy

`publish: direct` so a verified upgrade shows as REVIEW→PUBLISH. The client may add design-system
tokens/elements and build pages from templates; re-theming an existing element or a hand-authored new
page still routes to review.
