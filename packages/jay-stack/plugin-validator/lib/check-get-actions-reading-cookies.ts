/**
 * Static scan for GET action builder chains that call `.withRequest()` (DL#234).
 * A GET that reads cookies must stay read-only; the runtime rejects cross-origin calls.
 */

export interface SourceWarning {
    file: string;
    line: number;
    code: 'get-action-reads-cookies';
    message: string;
}

const SUPPRESS_MARKER = '// jay-action: allow-get-request';
const BUILDER_CALL = /\bmakeJay(Query|Action)\s*\(\s*(['"`])([^'"`]*)\2/g;
const CHAIN_END = /\.with(Stream)?Handler\s*\(/;
const WITH_REQUEST = /\.withRequest\s*\(/;
const WITH_METHOD = /\.withMethod\s*\(/;
const WITH_METHOD_GET = /\.withMethod\s*\(\s*(['"`])GET\1/;

/** Finds GET action builder chains that call .withRequest() (DL#234). */
export function checkGetActionsReadingCookies(source: string, file: string): SourceWarning[] {
    const code = blankComments(source);
    const lines = source.split('\n');
    const warnings: SourceWarning[] = [];
    for (const match of code.matchAll(BUILDER_CALL)) {
        const [, builderKind, , actionName] = match;
        const chain = chainText(code, match.index! + match[0].length);
        if (!WITH_REQUEST.test(chain) || !isGetChain(builderKind, chain)) continue;
        const line = lineNumberAt(code, match.index!);
        if (isSuppressed(lines, line)) continue;
        warnings.push({
            file,
            line,
            code: 'get-action-reads-cookies',
            message: warningMessage(file, line, actionName),
        });
    }
    return warnings;
}

function isGetChain(builderKind: string, chain: string): boolean {
    if (WITH_METHOD_GET.test(chain)) return true;
    return builderKind === 'Query' && !WITH_METHOD.test(chain);
}

/** The chain text from the builder call up to its handler (or the next builder call). */
function chainText(code: string, from: number): string {
    const rest = code.slice(from);
    const nextBuilder = rest.search(/\bmakeJay(Query|Action)\s*\(/);
    const bounded = nextBuilder === -1 ? rest : rest.slice(0, nextBuilder);
    const end = bounded.search(CHAIN_END);
    return end === -1 ? bounded : bounded.slice(0, end);
}

/** Suppressed by the marker trailing the builder-call line, or alone on the line directly above. */
function isSuppressed(lines: string[], line: number): boolean {
    const builderLine = lines[line - 1] ?? '';
    const lineAbove = lines[line - 2]?.trim();
    return builderLine.trimEnd().endsWith(SUPPRESS_MARKER) || lineAbove === SUPPRESS_MARKER;
}

function lineNumberAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

function warningMessage(file: string, line: number, actionName: string): string {
    return (
        `${file}:${line} — GET action '${actionName}' reads cookies (.withRequest()). ` +
        'It must not change state; use makeJayAction (POST) for writes. ' +
        `Cross-origin calls are rejected. Suppress with ${SUPPRESS_MARKER}`
    );
}

/** Replaces comment text with spaces (keeping newlines), skipping string literals. */
function blankComments(source: string): string {
    let out = '';
    let index = 0;
    while (index < source.length) {
        const char = source[index];
        const next = source[index + 1];
        if (char === '/' && next === '/') {
            const end = source.indexOf('\n', index);
            const stop = end === -1 ? source.length : end;
            out += ' '.repeat(stop - index);
            index = stop;
        } else if (char === '/' && next === '*') {
            const end = source.indexOf('*/', index + 2);
            const stop = end === -1 ? source.length : end + 2;
            out += source.slice(index, stop).replace(/[^\n]/g, ' ');
            index = stop;
        } else if (char === "'" || char === '"' || char === '`') {
            const stop = stringLiteralEnd(source, index);
            out += source.slice(index, stop);
            index = stop;
        } else {
            out += char;
            index++;
        }
    }
    return out;
}

function stringLiteralEnd(source: string, start: number): number {
    const quote = source[start];
    let index = start + 1;
    while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') index++;
        if (quote !== '`' && source[index] === '\n') return index;
        index++;
    }
    return Math.min(index + 1, source.length);
}
