import path from 'path';
import fs from 'fs';

/**
 * INP responsiveness checks on a page's interactive constructor (Design Log #244).
 *
 * No TypeScript AST: `maskSource` blanks comments and string / template / regex text
 * (offsets and newlines kept), then balanced-bracket matching finds the constructor body
 * and call arguments.
 */

const INP_SUPPRESS_COMMENT = 'jay-inp: allow';
const GUIDE_POINTER = 'See agent-kit/developer/responsiveness-guide.md';
const SUPPRESS_HINT = `Suppress with // ${INP_SUPPRESS_COMMENT} on the same line.`;

interface Span {
    start: number;
    end: number;
}

interface Finding {
    index: number;
    message: string;
}

/** Reads the page's `.ts` next to a jay-html file and returns INP warnings for it. */
export function checkInpResponsiveness(jayHtmlPath: string): string[] {
    const dirname = path.dirname(jayHtmlPath);
    const basename = path.basename(jayHtmlPath, '.jay-html');
    const candidates = [path.join(dirname, `${basename}.ts`), path.join(dirname, 'page.ts')];
    const componentPath = candidates.find((p) => fs.existsSync(p));
    if (!componentPath) return [];
    try {
        return findInpWarnings(
            fs.readFileSync(componentPath, 'utf-8'),
            path.basename(componentPath),
        );
    } catch {
        return [];
    }
}

/** INP warnings for a component source; only the `.withInteractive(...)` constructor is scanned. */
export function findInpWarnings(source: string, componentFileName: string): string[] {
    const masked = maskSource(source);
    const span = findInteractiveSpan(masked);
    if (!span) return [];
    const rawLines = source.split('\n');
    return [...findBlockingDialogs(masked, span), ...findZeroTimeouts(masked, span)]
        .sort((a, b) => a.index - b.index)
        .map((finding) => ({ ...finding, line: lineNumberAt(masked, finding.index) }))
        .filter((finding) => !rawLines[finding.line - 1].includes(INP_SUPPRESS_COMMENT))
        .map((finding) => `${componentFileName}:${finding.line} — ${finding.message}`);
}

// --- Rules ---

const DIALOG_CALL = /(?<![\w.$])(?:window\.)?(?:alert|confirm|prompt)\s*\(/g;
const DECLARATION_AFTER_PARAMS = /^\s*(?::[^{]*)?\{/;

function findBlockingDialogs(masked: string, span: Span): Finding[] {
    return matchesInSpan(masked, span, DIALOG_CALL)
        .filter((match) => {
            const openParen = match.index + match[0].length - 1;
            const closeParen = findClosingBracket(masked, openParen);
            return !DECLARATION_AFTER_PARAMS.test(masked.slice(closeParen + 1));
        })
        .map((match) => {
            const callee = match[0].replace(/\s*\($/, '');
            return {
                index: match.index,
                message:
                    `"${callee}(" blocks the main thread and hurts INP; ` +
                    `use an in-app dialog driven by ViewState. ${SUPPRESS_HINT} ${GUIDE_POINTER}`,
            };
        });
}

const SET_TIMEOUT_CALL = /(?<![\w$])setTimeout\s*\(/g;

function findZeroTimeouts(masked: string, span: Span): Finding[] {
    return matchesInSpan(masked, span, SET_TIMEOUT_CALL)
        .filter((match) => {
            const openParen = match.index + match[0].length - 1;
            const closeParen = findClosingBracket(masked, openParen);
            const args = splitTopLevelArguments(masked.slice(openParen + 1, closeParen));
            return args.length >= 2 && args[1].trim() === '0';
        })
        .map((match) => ({
            index: match.index,
            message:
                'setTimeout(…, 0) queues behind all other tasks; ' +
                `yield with scheduler.yield() (with fallback). ${SUPPRESS_HINT} ${GUIDE_POINTER}`,
        }));
}

function matchesInSpan(masked: string, span: Span, pattern: RegExp): RegExpExecArray[] {
    const text = masked.slice(0, span.end);
    const matches: RegExpExecArray[] = [];
    pattern.lastIndex = span.start;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        matches.push(match);
    }
    return matches;
}

// --- Interactive constructor resolution ---

const WITH_INTERACTIVE = /\.withInteractive\s*\(/;
const IDENTIFIER_ONLY = /^\s*([A-Za-z_$][\w$]*)\s*$/;

/** The source span of the constructor passed to `.withInteractive(...)`, if it can be resolved. */
export function findInteractiveSpan(masked: string): Span | undefined {
    const call = WITH_INTERACTIVE.exec(masked);
    if (!call) return undefined;
    const openParen = call.index + call[0].length - 1;
    const closeParen = findClosingBracket(masked, openParen);
    const argument = masked.slice(openParen + 1, closeParen);
    const name = IDENTIFIER_ONLY.exec(argument)?.[1];
    if (!name) return { start: openParen + 1, end: closeParen };
    return findNamedFunctionSpan(masked, name);
}

function findNamedFunctionSpan(masked: string, name: string): Span | undefined {
    const declaration = new RegExp(
        `(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*[<(]` +
            `|(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=`,
    ).exec(masked);
    if (!declaration) return undefined;
    const paramsOpen = masked.indexOf('(', declaration.index + declaration[0].length - 1);
    if (paramsOpen < 0) return undefined;
    const bodyOpen = masked.indexOf('{', findClosingBracket(masked, paramsOpen));
    if (bodyOpen < 0) return undefined;
    return { start: declaration.index, end: findClosingBracket(masked, bodyOpen) };
}

// --- Bracket helpers ---

const CLOSING: Record<string, string> = { '(': ')', '{': '}', '[': ']' };

function findClosingBracket(text: string, openIndex: number): number {
    const open = text[openIndex];
    const close = CLOSING[open];
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === open) depth++;
        else if (text[i] === close && --depth === 0) return i;
    }
    return text.length;
}

function splitTopLevelArguments(argumentText: string): string[] {
    const args: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of argumentText) {
        if ('([{'.includes(char)) depth++;
        else if (')]}'.includes(char)) depth--;
        if (char === ',' && depth === 0) {
            args.push(current);
            current = '';
        } else current += char;
    }
    if (current.trim() || args.length) args.push(current);
    return args;
}

function lineNumberAt(text: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
    return line;
}

// --- Masking ---

/** Chars after which a `/` starts a regex literal rather than a division. */
const REGEX_PRECEDERS = new Set([...'(,=:[!&|?{};+-*%<>~^']);

/**
 * Blanks comment, string, template-text and regex-body characters with spaces.
 * Delimiters, template `${...}` code and newlines are kept, so offsets and line numbers match.
 */
export function maskSource(source: string): string {
    return new SourceMasker(source).mask();
}

class SourceMasker {
    private readonly out: string[];
    private i = 0;
    private inTemplateText = false;
    /** Brace depth inside each open template `${`, innermost last. */
    private readonly templateBraceDepths: number[] = [];
    private lastCodeChar = '';

    constructor(private readonly source: string) {
        this.out = [...source];
    }

    mask(): string {
        while (this.i < this.source.length) {
            if (this.inTemplateText) this.stepTemplateText();
            else this.stepCode();
        }
        return this.out.join('');
    }

    private stepCode(): void {
        const char = this.source[this.i];
        const next = this.source[this.i + 1];
        if (char === '/' && next === '/') return this.blankUntil('\n');
        if (char === '/' && next === '*') return this.blankBlockComment();
        if (char === '"' || char === "'") return this.blankQuoted(char);
        if (char === '/' && (this.lastCodeChar === '' || REGEX_PRECEDERS.has(this.lastCodeChar)))
            return this.blankRegex();
        if (char === '`') {
            this.inTemplateText = true;
        } else if (char === '{' && this.templateBraceDepths.length) {
            this.templateBraceDepths[this.templateBraceDepths.length - 1]++;
        } else if (char === '}' && this.templateBraceDepths.length) {
            const top = this.templateBraceDepths.length - 1;
            if (this.templateBraceDepths[top] === 0) {
                this.templateBraceDepths.pop();
                this.inTemplateText = true;
            } else this.templateBraceDepths[top]--;
        }
        if (!/\s/.test(char)) this.lastCodeChar = char;
        this.i++;
    }

    private stepTemplateText(): void {
        const char = this.source[this.i];
        if (char === '`') {
            this.inTemplateText = false;
            this.lastCodeChar = '`';
            this.i++;
        } else if (char === '$' && this.source[this.i + 1] === '{') {
            this.inTemplateText = false;
            this.templateBraceDepths.push(0);
            this.lastCodeChar = '{';
            this.i += 2;
        } else if (char === '\\') {
            this.blank(this.i);
            this.blank(this.i + 1);
            this.i += 2;
        } else {
            this.blank(this.i);
            this.i++;
        }
    }

    private blankUntil(terminator: string): void {
        while (this.i < this.source.length && this.source[this.i] !== terminator) {
            this.blank(this.i++);
        }
    }

    private blankBlockComment(): void {
        const end = this.source.indexOf('*/', this.i + 2);
        const stop = end < 0 ? this.source.length : end + 2;
        while (this.i < stop) this.blank(this.i++);
    }

    private blankQuoted(quote: string): void {
        this.i++;
        while (this.i < this.source.length && this.source[this.i] !== quote) {
            if (this.source[this.i] === '\n') break;
            if (this.source[this.i] === '\\') this.blank(this.i++);
            this.blank(this.i++);
        }
        this.i++;
        this.lastCodeChar = quote;
    }

    private blankRegex(): void {
        this.i++;
        let inClass = false;
        while (this.i < this.source.length && this.source[this.i] !== '\n') {
            const char = this.source[this.i];
            if (char === '/' && !inClass) break;
            if (char === '[') inClass = true;
            else if (char === ']') inClass = false;
            if (char === '\\') this.blank(this.i++);
            this.blank(this.i++);
        }
        this.i++;
        this.lastCodeChar = '/';
    }

    private blank(index: number): void {
        if (index < this.out.length && this.out[index] !== '\n') this.out[index] = ' ';
    }
}
