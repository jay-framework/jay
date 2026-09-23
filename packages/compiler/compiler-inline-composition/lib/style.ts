/**
 * DL#196 §4 — inline `style` attribute → ordered property map, for per-declaration facets.
 *
 * Split on `;` and the first `:`, but never inside `{...}` bindings or `(...)` (so `url(a;b)` and
 * `{cond ? 'a' : 'b'}` stay intact). Values are kept raw; comparison normalizes whitespace elsewhere.
 */

/** Parse an inline style string into an ordered map of lowercased-property → raw-value. */
export function parseInlineStyle(style: string | undefined): Map<string, string> {
    const out = new Map<string, string>();
    if (!style) return out;
    for (const decl of splitDeclarations(style)) {
        const idx = firstColon(decl);
        if (idx < 0) continue;
        const property = decl.slice(0, idx).trim().toLowerCase();
        const value = decl.slice(idx + 1).trim();
        if (property) out.set(property, value);
    }
    return out;
}

/** Serialize an ordered property→value map back to an inline `style` string. */
export function serializeInlineStyle(decls: Map<string, string>): string {
    return [...decls].map(([property, value]) => `${property}: ${value}`).join('; ');
}

function splitDeclarations(style: string): string[] {
    const parts: string[] = [];
    let depthParen = 0;
    let depthBrace = 0;
    let current = '';
    for (const ch of style) {
        if (ch === '(') depthParen++;
        else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
        else if (ch === '{') depthBrace++;
        else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
        if (ch === ';' && depthParen === 0 && depthBrace === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) parts.push(current);
    return parts.filter((p) => p.trim());
}

function firstColon(decl: string): number {
    let depthParen = 0;
    let depthBrace = 0;
    for (let i = 0; i < decl.length; i++) {
        const ch = decl[i];
        if (ch === '(') depthParen++;
        else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
        else if (ch === '{') depthBrace++;
        else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
        else if (ch === ':' && depthParen === 0 && depthBrace === 0) return i;
    }
    return -1;
}
