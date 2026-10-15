import type { JayHtmlValidationFinding } from '@jay-framework/compiler-shared';

export const CSS_FIRST_NAMESPACE = 'css-first';

const GUIDE = '\nSee: agent-kit/designer/css-first-patterns.md';

export function cssFirstWarning(
    ruleKey: string,
    message: string,
    suggestion?: string,
    extra?: Partial<JayHtmlValidationFinding>,
): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        ruleId: `${CSS_FIRST_NAMESPACE}/${ruleKey}`,
        suppressKey: ruleKey,
        message,
        suggestion: suggestion ? suggestion + GUIDE : undefined,
        ...extra,
    };
}

export function cssFirstError(
    ruleKey: string,
    message: string,
    suggestion?: string,
    extra?: Partial<JayHtmlValidationFinding>,
): JayHtmlValidationFinding {
    return {
        severity: 'error',
        ruleId: `${CSS_FIRST_NAMESPACE}/${ruleKey}`,
        message,
        suggestion: suggestion ? suggestion + GUIDE : undefined,
        ...extra,
    };
}
