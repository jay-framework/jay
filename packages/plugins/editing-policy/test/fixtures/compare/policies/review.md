---
version: 1
defaultRole: client
roles:
  client:
    - selector: '**'
      rules:
        {
          content: yes,
          design: yes,
          css: yes,
          code: yes,
          config: yes,
          dependencies: yes,
          create: yes,
          delete: yes,
          rename: yes,
          policy: yes,
          publish: review,
        }
---

# Review-on-publish policy

Everything is allowed, but the client's work always routes to the admin (`publish: review`) — so a
clean candidate is REVIEW with no findings.
