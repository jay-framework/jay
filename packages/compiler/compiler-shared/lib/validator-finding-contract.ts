import type { JayHtmlValidationFinding } from './plugin-validators';

/** Warnings from plugin validators must carry a suppressKey for page-level overrides (DL#220). */
export function findingsMissingSuppressKey(
    findings: JayHtmlValidationFinding[],
): JayHtmlValidationFinding[] {
    return findings.filter(
        (finding) => finding.severity === 'warning' && !finding.suppressKey,
    );
}
