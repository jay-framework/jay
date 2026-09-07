import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import postcss, { type Declaration, type Comment, type Root } from 'postcss';

const ALLOW_COMMENT = 'design-system: allow';

const VAR_REGEX = /var\(\s*(--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\s*\)/g;

interface VarUsage {
    property: string;
    selector: string;
    source: string;
    hasFallback: boolean;
    fallbackValue?: string;
}

function hasAllowComment(decl: Declaration): boolean {
    const next = decl.next();
    if (next?.type === 'comment' && (next as Comment).text.trim() === ALLOW_COMMENT) {
        return true;
    }
    const raw = decl.raws.value;
    if (raw && typeof raw === 'object' && 'raw' in raw) {
        const rawStr = (raw as any).raw as string;
        if (rawStr.includes(`/*${ALLOW_COMMENT}*/`) || rawStr.includes(`/* ${ALLOW_COMMENT} */`)) {
            return true;
        }
    }
    return false;
}

function findSource(decl: Declaration, root: Root): string {
    const before = root.toString().substring(0, decl.source?.start?.offset ?? 0);
    const componentMatch = before.match(/\/\* Component: (\S+) \*\//g);
    if (componentMatch) {
        const last = componentMatch[componentMatch.length - 1];
        const name = last.match(/\/\* Component: (\S+) \*\//)?.[1];
        if (name) return name;
    }
    return '';
}

export const validateUndefinedVars: JayHtmlValidatorFn = (ctx) => {
    if (!ctx.css) return [];

    // Skip standalone component files — they inherit vars from pages at runtime.
    // Only validate pages, which have the full merged CSS context.
    if (!ctx.filePath.includes('/pages/') && !ctx.filePath.startsWith('src/pages/')) {
        return [];
    }

    const findings: JayHtmlValidationFinding[] = [];
    const definedVars = new Set<string>();
    const usedVars = new Map<string, VarUsage>();

    const root = postcss.parse(ctx.css);

    root.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) {
            definedVars.add(decl.prop);
        }

        if (decl.value.includes('var(') && !hasAllowComment(decl)) {
            const selector =
                decl.parent && 'selector' in decl.parent
                    ? (decl.parent as any).selector
                    : '[unknown]';

            let match: RegExpExecArray | null;
            VAR_REGEX.lastIndex = 0;
            while ((match = VAR_REGEX.exec(decl.value)) !== null) {
                const varName = match[1];
                if (!usedVars.has(varName)) {
                    usedVars.set(varName, {
                        property: decl.prop,
                        selector,
                        source: findSource(decl, root),
                        hasFallback: match[2] !== undefined,
                        fallbackValue: match[2]?.trim(),
                    });
                }
            }
        }
    });

    for (const [varName, usage] of usedVars) {
        if (definedVars.has(varName)) continue;

        const fallbackNote = usage.hasFallback ? ` (falls back to "${usage.fallbackValue}")` : '';

        const message = usage.source
            ? `CSS variable "${varName}" used by component "${usage.source}" is not defined${fallbackNote} — add it to the page's CSS or a linked stylesheet`
            : `CSS variable "${varName}" is used but never defined${fallbackNote}`;

        findings.push({
            severity: 'warning',
            message,
            suggestion:
                `Define ${varName} in a :root block, or replace with a DESIGN.md token value directly.\n` +
                `To suppress: add /* design-system: allow */ on the same line or the line after the declaration.\n` +
                `See agent-kit/designer/design-system.md for usage guide.`,
        });
    }

    return findings;
};
