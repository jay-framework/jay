---
version: 1
defaultRole: client
roles:
  client:
    - selector: "**"
      rules: { content: yes, design: yes, css: yes, code: yes, config: yes, dependencies: yes,
               create: yes, delete: yes, rename: yes, policy: yes, publish: direct }
---

# Permissive policy

The same candidate, judged by a policy that lets the client do everything — demonstrates that the
disposition comes from the policy, not the change.
