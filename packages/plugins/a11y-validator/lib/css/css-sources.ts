import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import { allElements, tagOf } from '../dom.js';

/**
 * One separately parsed piece of page CSS and where it came from (DL#239 location format, DL#240
 * `jay:` source markers). `reportsLines` is false when postcss lines would not match the file.
 */
export interface CssSource {
    origin: CssOrigin;
    css: string;
    reportsLines: boolean;
}

export type CssOrigin =
    | { kind: 'external'; file: string }
    | { kind: 'import'; file: string }
    | { kind: 'head' }
    /** The last linked file with head `<style>` appended and no `jay:head-style` boundary (legacy input). */
    | { kind: 'external-and-head'; file: string }
    | { kind: 'unmarked' }
    | { kind: 'body-style'; index: number };

const MARKER =
    /\/\* (?:External CSS: (?<external>.+?)|(?<head>jay:head-style)|jay:@import (?<push>.+?)|jay:end-@import (?<pop>.+?)) \*\/\n?/g;

/** `ctx.css` split at its source markers, plus every body `<style>` (not part of `ctx.css`). */
export function collectCssSources(ctx: JayHtmlValidationContext): CssSource[] {
    return [...collectPageCssSources(ctx), ...bodyStyleSources(ctx.body)];
}

/** `ctx.css` only, split at its source markers. */
export function collectPageCssSources(ctx: JayHtmlValidationContext): CssSource[] {
    const css = ctx.css ?? '';
    const sources: CssSource[] = [];
    let stack: CssOrigin[] = [{ kind: 'unmarked' }];
    let pieceStart = 0;
    let piecesSinceTopLevel = 0;
    const flush = (end: number) => {
        const text = css.slice(pieceStart, end);
        if (text.trim() !== '') {
            const origin = stack[stack.length - 1];
            // A file's text after an inlined @import no longer starts at its own line 1.
            const reportsLines = origin.kind !== 'head' && piecesSinceTopLevel === 0;
            sources.push({ origin, css: text, reportsLines });
        }
        piecesSinceTopLevel++;
    };
    for (const marker of css.matchAll(MARKER)) {
        flush(marker.index!);
        const { external, head, push, pop } = marker.groups!;
        if (external !== undefined || head !== undefined) {
            stack = [
                external !== undefined ? { kind: 'external', file: external } : { kind: 'head' },
            ];
            piecesSinceTopLevel = 0;
        } else if (push !== undefined) {
            stack.push({ kind: 'import', file: push });
            piecesSinceTopLevel = 0;
        } else if (pop !== undefined && stack.length > 1) {
            stack.pop();
        }
        pieceStart = marker.index! + marker[0].length;
    }
    flush(css.length);
    return markLegacyHeadStyle(sources, ctx);
}

/**
 * Without a `jay:head-style` marker, head `<style>` text is appended to the last linked file with no
 * boundary. When the head carries styles, that last source names both and drops its lines (DL#239).
 */
function markLegacyHeadStyle(sources: CssSource[], ctx: JayHtmlValidationContext): CssSource[] {
    const hasHeadStyle = (ctx.head?.styles ?? []).some((style) => style.trim() !== '');
    if (!hasHeadStyle || sources.some((s) => s.origin.kind === 'head')) return sources;
    const last = sources[sources.length - 1];
    if (!last) return sources;
    if (last.origin.kind === 'unmarked') {
        sources[sources.length - 1] = { ...last, origin: { kind: 'head' }, reportsLines: false };
    } else if (last.origin.kind === 'external') {
        sources[sources.length - 1] = {
            ...last,
            origin: { kind: 'external-and-head', file: last.origin.file },
            reportsLines: false,
        };
    }
    return sources;
}

function bodyStyleSources(body: any): CssSource[] {
    return allElements(body)
        .filter((el) => tagOf(el) === 'style')
        .map((el, index) => ({
            origin: { kind: 'body-style', index: index + 1 } as const,
            css: el.text ?? '',
            reportsLines: true,
        }));
}

/** DL#239 label: `style#1`, `./a.css`, `./a.css + head style`, `head style`, `css`. */
export function focusSourceLabel(origin: CssOrigin): string {
    switch (origin.kind) {
        case 'external':
        case 'import':
            return origin.file;
        case 'external-and-head':
            return `${origin.file} + head style`;
        case 'head':
            return 'head style';
        case 'unmarked':
            return 'css';
        case 'body-style':
            return `style#${origin.index}`;
    }
}

/** `[<source> line <n>]`, or `[<source>]` when the line is unknown or unreliable (DL#239). */
export function locationPrefix(source: CssSource, line: number | undefined): string {
    const label = focusSourceLabel(source.origin);
    return source.reportsLines && line !== undefined ? `[${label} line ${line}]` : `[${label}]`;
}

/** DL#240 file name: `styles/form.css`, `<head> <style>`, `page CSS`. */
export function formSourceName(origin: CssOrigin): string {
    switch (origin.kind) {
        case 'external':
        case 'import':
        case 'external-and-head':
            return origin.file;
        case 'head':
            return '<head> <style>';
        case 'unmarked':
            return 'page CSS';
        case 'body-style':
            return `<body> <style> #${origin.index}`;
    }
}
