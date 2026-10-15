import fs from 'fs';
import path from 'path';
import type {
    JayHtmlValidationFinding,
    ValidationFindingLocation,
} from '@jay-framework/compiler-shared';

export function ruleNamespace(ruleId?: string): string | undefined {
    if (!ruleId) return undefined;
    const slash = ruleId.indexOf('/');
    return slash === -1 ? ruleId : ruleId.slice(0, slash);
}

export type LineTextResolver = (relativeFile: string, line: number) => string | undefined;

export function createLineTextResolver(projectRoot: string): LineTextResolver {
    const cache = new Map<string, string[]>();
    return (relativeFile: string, line: number) => {
        let lines = cache.get(relativeFile);
        if (lines === undefined) {
            const absolute = path.resolve(projectRoot, relativeFile);
            try {
                lines = fs.readFileSync(absolute, 'utf-8').split('\n');
            } catch {
                return undefined;
            }
            cache.set(relativeFile, lines);
        }
        const index = line - 1;
        if (index < 0 || index >= lines.length) return undefined;
        return lines[index];
    };
}

export function isFindingSuppressed(
    finding: Pick<
        JayHtmlValidationFinding,
        'ruleId' | 'suppressKey' | 'location' | 'severity'
    >,
    templateRelativePath: string,
    validationOverrides: Record<string, Record<string, boolean | string[]>> | undefined,
    resolveLineText: LineTextResolver,
): boolean {
    const namespace = ruleNamespace(finding.ruleId);
    if (!namespace) return false;

    if (finding.suppressKey && validationOverrides?.[namespace]?.[finding.suppressKey] === true) {
        return true;
    }

    if (finding.location?.line) {
        const locFile = finding.location.file ?? templateRelativePath;
        const lineText = resolveLineText(locFile, finding.location.line);
        if (lineText && new RegExp(`${namespace}:\\s*allow`).test(lineText)) {
            return true;
        }
    }

    return false;
}

export function computeRuleCounts(
    errors: Array<{ ruleId?: string }>,
    warnings: Array<{ ruleId?: string }>,
): Record<string, number> {
    const counts: Record<string, number> = {};
    const bump = (ruleId?: string) => {
        const key = ruleId ?? '(unidentified)';
        counts[key] = (counts[key] ?? 0) + 1;
    };
    for (const error of errors) bump(error.ruleId);
    for (const warning of warnings) bump(warning.ruleId);
    return counts;
}

export function formatWarningLocation(location?: ValidationFindingLocation): string {
    if (!location) return '';
    const file = location.file;
    if (file) return `${file}:${location.line}`;
    return `:${location.line}`;
}
