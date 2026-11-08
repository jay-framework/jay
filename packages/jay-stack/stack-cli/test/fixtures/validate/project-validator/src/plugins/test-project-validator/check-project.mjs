// Project-level validator (DL#232): invoked once per project with { projectRoot }.
// Local-plugin handlers are loaded by their `validate` (or default) export.
export const validate = (ctx) => {
  const findings = [];

  // Prove the context carries a usable projectRoot without leaking the absolute
  // (machine-specific) path into the asserted message.
  if (typeof ctx.projectRoot !== 'string' || ctx.projectRoot.length === 0) {
    findings.push({
      severity: 'error',
      file: '.jay',
      message: 'Project validator did not receive a projectRoot',
    });
    return findings;
  }

  findings.push({
    severity: 'error',
    file: 'jay-policy.md',
    message: 'Project-level error from fixture',
    suggestion: 'This is a fixture finding',
  });
  findings.push({
    severity: 'warning',
    file: '.jay',
    message: 'Project-level warning from fixture',
  });
  return findings;
};
