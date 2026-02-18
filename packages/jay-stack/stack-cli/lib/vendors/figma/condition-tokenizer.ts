export interface ConditionIdentifier {
    path: string[];
    operator?: '==' | '!=' | '>' | '<' | '>=' | '<=';
    comparedValue?: string;
    isNegated: boolean;
    isComputed: boolean;
    rawExpression: string;
}

const COMPARISON_OPS = ['==', '!=', '>=', '<=', '>', '<'] as const;
const JS_PROPERTIES = new Set(['length', 'size']);

function splitOnLogicalAtDepthZero(expr: string): { parts: string[]; separators: ('&&' | '||')[] } {
    const trimmed = expr.trim();
    if (!trimmed) return { parts: [], separators: [] };

    const parts: string[] = [];
    const separators: ('&&' | '||')[] = [];
    let depth = 0;
    let start = 0;
    let i = 0;

    while (i < trimmed.length) {
        const c = trimmed[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;

        if (depth === 0) {
            const andMatch = trimmed.slice(i).match(/^&&/);
            const orMatch = trimmed.slice(i).match(/^\|\|/);
            if (andMatch) {
                parts.push(trimmed.slice(start, i).trim());
                separators.push('&&');
                i += 2;
                start = i;
                continue;
            }
            if (orMatch) {
                parts.push(trimmed.slice(start, i).trim());
                separators.push('||');
                i += 2;
                start = i;
                continue;
            }
        }
        i++;
    }
    parts.push(trimmed.slice(start).trim());
    return { parts, separators };
}

function stripOuterParens(s: string): string {
    let t = s.trim();
    while (t.startsWith('(') && t.endsWith(')')) {
        let depth = 0;
        let balanced = true;
        for (let i = 1; i < t.length - 1; i++) {
            const c = t[i];
            if (c === '(') depth++;
            else if (c === ')') {
                depth--;
                if (depth < 0) {
                    balanced = false;
                    break;
                }
            }
        }
        if (balanced && depth === 0) t = t.slice(1, -1).trim();
        else break;
    }
    return t;
}

function hasTernary(expr: string): boolean {
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        if (depth === 0 && (c === '?' || c === ':')) return true;
    }
    return false;
}

function hasFunctionCall(expr: string): boolean {
    return /[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(expr);
}

function hasTemplateLiteral(expr: string): boolean {
    return /`[^`]*`/.test(expr) || /\$\{/.test(expr);
}

function pathHasJsProperty(pathParts: string[]): boolean {
    return pathParts.some((p) => JS_PROPERTIES.has(p));
}

function findOperator(expr: string): { op: (typeof COMPARISON_OPS)[number]; idx: number } | null {
    let depth = 0;
    let i = 0;
    while (i < expr.length) {
        const c = expr[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;

        if (depth === 0) {
            for (const op of COMPARISON_OPS) {
                const slice = expr.slice(i);
                if (slice.startsWith(op)) {
                    const before = expr.slice(0, i).trim();
                    const after = expr.slice(i + op.length).trim();
                    if (before && after) return { op, idx: i };
                }
            }
        }
        i++;
    }
    return null;
}

function parsePath(leftSide: string): string[] {
    const trimmed = leftSide.trim();
    if (!trimmed) return [];
    return trimmed
        .split('.')
        .map((s) => s.trim())
        .filter(Boolean);
}

function tokenizeSingleTerm(term: string, rawOverride?: string): ConditionIdentifier {
    const raw = rawOverride ?? term;
    let t = term.trim();
    let isNegated = false;

    t = stripOuterParens(t);

    if (t.startsWith('!')) {
        const rest = t.slice(1).trim();
        if (rest.startsWith('(')) {
            const inner = stripOuterParens(rest);
            if (!inner.includes('&&') && !inner.includes('||')) {
                isNegated = true;
                t = inner;
            }
        } else {
            isNegated = true;
            t = rest;
        }
    }

    if (hasTernary(t) || hasFunctionCall(t) || hasTemplateLiteral(t)) {
        return {
            path: [],
            isNegated: false,
            isComputed: true,
            rawExpression: raw,
        };
    }

    const opResult = findOperator(t);
    if (opResult) {
        const { op, idx } = opResult;
        const left = t.slice(0, idx).trim();
        const right = t.slice(idx + op.length).trim();
        const pathParts = parsePath(left);
        const comparedValue = right;

        const isComputed =
            pathHasJsProperty(pathParts) ||
            hasFunctionCall(left) ||
            hasTemplateLiteral(left) ||
            hasTemplateLiteral(right);

        return {
            path: pathParts,
            operator: op,
            comparedValue,
            isNegated,
            isComputed,
            rawExpression: raw,
        };
    }

    const pathParts = parsePath(t);
    const isComputed = pathHasJsProperty(pathParts) || hasFunctionCall(t);

    return {
        path: pathParts,
        isNegated,
        isComputed,
        rawExpression: raw,
    };
}

function tokenizeRecursive(expr: string, originalExpr?: string): ConditionIdentifier[] {
    const trimmed = expr.trim();
    if (!trimmed) return [];

    const { parts } = splitOnLogicalAtDepthZero(trimmed);
    const result: ConditionIdentifier[] = [];
    const useOriginal =
        originalExpr !== undefined && parts.length === 1 && originalExpr.trim() === trimmed;

    for (const part of parts) {
        if (!part) continue;
        const stripped = stripOuterParens(part);
        const innerParts = splitOnLogicalAtDepthZero(stripped);
        if (innerParts.parts.length > 1) {
            for (const p of innerParts.parts) {
                if (p) result.push(...tokenizeRecursive(p));
            }
        } else {
            const raw = useOriginal ? originalExpr : undefined;
            result.push(tokenizeSingleTerm(part, raw));
        }
    }

    return result;
}

export function tokenizeCondition(conditionExpr: string): ConditionIdentifier[] {
    const trimmed = conditionExpr.trim();
    if (!trimmed) return [];
    return tokenizeRecursive(trimmed, conditionExpr);
}
