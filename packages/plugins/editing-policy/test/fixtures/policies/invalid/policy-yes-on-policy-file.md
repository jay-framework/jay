---
version: 1
roles:
  designer:
    - selector: '**'
      rules: { design: yes }
    - selector: 'jay-policy.md'
      rules: { policy: yes }
---

# Policy that grants a non-admin role policy:yes on the policy file
