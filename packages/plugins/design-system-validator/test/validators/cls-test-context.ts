import { parse } from 'node-html-parser';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';

export const PAGE = 'src/pages/x/page.jay-html';
export const COMPONENT = 'src/components/c/c.jay-html';

/** Builds a validation context from a jay-html snippet: head <style> → css, <body> → body. */
export function makeContext(
    html: string,
    overrides: Partial<JayHtmlValidationContext> = {},
): JayHtmlValidationContext {
    const root = parse(html);
    const css = root
        .querySelectorAll('style')
        .map((style) => style.textContent)
        .join('\n');
    return {
        body: root.querySelector('body') ?? root,
        css: css || undefined,
        head: { meta: [], links: [] },
        filePath: PAGE,
        projectRoot: '/tmp/test-project',
        headlessImports: [],
        ...overrides,
    };
}

export function suppressed(key: string): Partial<JayHtmlValidationContext> {
    return { validationOverrides: { 'design-system': { [key]: true } } };
}
