import type { JayHtmlValidationFinding } from '@jay-framework/compiler-shared';

/**
 * `content-visibility: auto` without `contain-intrinsic-size` (Design Log #244):
 * skipped content collapses to 0px, so the scrollbar jumps and layout shifts.
 */

export const CONTENT_VISIBILITY_SUPPRESS_KEY = 'allow-content-visibility-without-size';

const INTRINSIC_SIZE_PROPERTY = /^contain-intrinsic-(?:size|block-size|inline-size|width|height)$/;

interface CssRule {
    selector: string;
    declarations: string;
}

export function findContentVisibilityWithoutSize(css: string): JayHtmlValidationFinding[] {
    return collectRules(maskCss(css))
        .filter((rule) => declaresAutoWithoutSize(rule.declarations))
        .map((rule) => ({
            severity: 'warning',
            message: `${rule.selector} uses content-visibility: auto without contain-intrinsic-size — scrollbar jumps and layout shift`,
            suggestion:
                'Add contain-intrinsic-size: auto <px>. ' +
                `Suppress with seo: { ${CONTENT_VISIBILITY_SUPPRESS_KEY}: true } in <script type="application/jay-validations">. ` +
                'See agent-kit/designer/jay-html-styling.md',
        }));
}

function declaresAutoWithoutSize(declarations: string): boolean {
    const properties = declarations
        .split(';')
        .map((declaration) => declaration.split(':'))
        .filter((parts) => parts.length >= 2)
        .map(([name, ...value]) => ({
            name: name.trim().toLowerCase(),
            value: value.join(':').trim().toLowerCase(),
        }));
    const hasAuto = properties.some((p) => p.name === 'content-visibility' && p.value === 'auto');
    return hasAuto && !properties.some((p) => INTRINSIC_SIZE_PROPERTY.test(p.name));
}

/**
 * Walks `selector { ... }` blocks, descending into at-rule blocks (`@media`, `@supports`, ...).
 * Runs on masked CSS, so braces in comments and strings cannot unbalance it.
 */
function collectRules(masked: string): CssRule[] {
    const rules: CssRule[] = [];
    let preludeStart = 0;
    for (let i = 0; i < masked.length; i++) {
        if (masked[i] === '}') preludeStart = i + 1;
        if (masked[i] === ';' && masked.lastIndexOf('{', i) < preludeStart) preludeStart = i + 1;
        if (masked[i] !== '{') continue;
        const prelude = masked.slice(preludeStart, i).trim();
        if (prelude.startsWith('@')) {
            preludeStart = i + 1;
            continue;
        }
        const close = findClosingBrace(masked, i);
        rules.push({ selector: prelude, declarations: masked.slice(i + 1, close) });
        i = close;
        preludeStart = close + 1;
    }
    return rules;
}

function findClosingBrace(text: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return i;
    }
    return text.length;
}

/** Blanks comments and string contents, keeping offsets. */
function maskCss(css: string): string {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, (comment) => ' '.repeat(comment.length))
        .replace(
            /(["'])(?:\\.|(?!\1).)*\1/g,
            (str) => str[0] + ' '.repeat(str.length - 2) + str[0],
        );
}
