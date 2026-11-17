# Editing policy — what the developer needs to know

The project's edit permissions live in `jay-policy.md`; authoring it and running the enforcement gate
are dev-ops concerns — see the dev-ops editing-policy guide.

As a developer you rarely author the policy, but you work alongside it:

- **The policy is read from the baseline**, and `jay-stack validate` validates `jay-policy.md` on every
  run (via the `projectValidators` hook). A malformed policy fails validation — fix the reported YAML /
  selector / rule error.
- **File type decides which rule governs a change.** Your `.ts` / `.js` / `.jay-contract` edits are
  `code`; a new contract is a `code` change that also needs `create`. `.css` is `css`. Components are
  governed too — a component's files are judged by the selectors matching its path.
- **Changing the policy file or a `jay-policy` marker needs the `policy` right** (default: denied). A
  candidate cannot grant itself more rights by editing the policy — rights come only from the baseline.
- **Templates are copy-not-link (DL#196):** editing a template component does not propagate to pages;
  a template change reaches a page only through `sync`.

For the policy file format, the rule vocabulary, selector syntax, and how to run `editing-policy
compare` (the baseline-vs-candidate gate with exit codes 0/10/11/1), see **the dev-ops editing-policy
guide**. For marking parts of a page with `jay-policy="<name>"`, see **the designer editing-policy
guide**.
