import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import { allElements, tagOf } from '../dom.js';

/**
 * One separately parsed piece of page CSS, with the label a finding uses to point at it (DL#239
 * "Location format"). `reportsLines` is false when postcss line numbers would not match the file.
 */
export interface CssSource {
    label: string;
    css: string;
    reportsLines: boolean;
}

const EXTERNAL_MARKER = /\/\* External CSS: (.+?) \*\/\n?/g;

/** `ctx.css` split per linked file, plus every body `<style>` (which the parser leaves out of `ctx.css`). */
export function collectCssSources(ctx: JayHtmlValidationContext): CssSource[] {
    return [...splitPageCss(ctx), ...bodyStyleSources(ctx.body)];
}

function splitPageCss(ctx: JayHtmlValidationContext): CssSource[] {
    const css = ctx.css ?? '';
    const hasHeadStyle = (ctx.head?.styles ?? []).some((style) => style.trim() !== '');
    const markers = [...css.matchAll(EXTERNAL_MARKER)];
    if (markers.length === 0) {
        if (css.trim() === '') return [];
        return [
            hasHeadStyle
                ? { label: 'head style', css, reportsLines: false }
                : { label: 'css', css, reportsLines: true },
        ];
    }
    return markers.map((marker, index) => {
        const start = marker.index! + marker[0].length;
        const end = index + 1 < markers.length ? markers[index + 1].index! : css.length;
        const href = marker[1];
        const isLast = index === markers.length - 1;
        // ctx.css appends head <style> texts to the last linked file with no boundary marker.
        return isLast && hasHeadStyle
            ? { label: `${href} + head style`, css: css.slice(start, end), reportsLines: false }
            : { label: href, css: css.slice(start, end), reportsLines: true };
    });
}

function bodyStyleSources(body: any): CssSource[] {
    return allElements(body)
        .filter((el) => tagOf(el) === 'style')
        .map((el, index) => ({
            label: `style#${index + 1}`,
            css: el.text ?? '',
            reportsLines: true,
        }));
}

/** `[<source> line <n>]`, or `[<source>]` when the line is unknown or unreliable. */
export function locationPrefix(source: CssSource, line: number | undefined): string {
    return source.reportsLines && line !== undefined
        ? `[${source.label} line ${line}]`
        : `[${source.label}]`;
}
