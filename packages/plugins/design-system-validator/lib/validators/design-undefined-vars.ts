import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import postcss, { type Declaration, type Comment } from 'postcss';

const ALLOW_COMMENT = 'design-system: allow';

const VAR_REGEX = /var\(\s*(--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\s*\)/g;

interface VarUsage {
    property: string;
    selector: string;
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

export const validateUndefinedVars: JayHtmlValidatorFn = (ctx) => {
    if (!ctx.css) return [];

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

        findings.push({
            severity: 'warning',
            message: `CSS variable "${varName}" is used but never defined${fallbackNote}`,
            suggestion:
                `Define ${varName} in a :root block, or replace with a DESIGN.md token value directly.\n` +
                `To suppress: add /* design-system: allow */ on the same line or the line after the declaration.\n` +
                `See agent-kit/designer/design-system.md for usage guide.`,
        });
    }

    return findings;
};
