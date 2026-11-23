import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fsp } from 'fs';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import {
    checkHtmlStringTrust,
    checkInlineEventHandlers,
    checkJavascriptUrls,
    checkRawHtmlSinks,
} from '../lib/validate-html-safety';
import { validateJayFiles } from '../lib/validate';

// DL#237 — html-safety validate rules. Expected messages are the rule's specified wording.

const fixturesDir = path.resolve(__dirname, './fixtures/validate/html-safety');
const GUIDE = 'See agent-kit/developer/html-safety.md.';

async function parsePage(fileName: string) {
    const jayFile = path.join(fixturesDir, fileName);
    const content = await fsp.readFile(jayFile, 'utf-8');
    const parsed = await parseJayFile(
        content,
        path.basename(jayFile, '.jay-html'),
        path.dirname(jayFile),
        {},
        JAY_IMPORT_RESOLVER,
        fixturesDir,
    );
    expect(parsed.validations).toEqual([]);
    return parsed.val!;
}

function trustWarning(tagPath: string, element: string): string {
    return (
        `HTML-STRING-TRUST: {${tagPath}} on <${element}> is html-string and is rendered as raw HTML. ` +
        `Jay does not sanitize html-string anywhere (server, slow phase, client). ` +
        `Bind only trusted markup, or sanitize it at the source on the server, then add it to ` +
        `jay-stack: { allow-html-string: ["${tagPath}"] } in this page's application/jay-validations script, ` +
        `or add jay-validations="HTML-STRING-TRUST" on the headless import. ${GUIDE}`
    );
}

function sinkWarning(sink: string, line: number): string {
    return (
        `RAW-HTML-SINK: Raw HTML sink "${sink}" at page.ts:${line}. ` +
        `Use a text binding, or an html-string tag with data sanitized at the source. ` +
        `Suppress with // jay-validations: RAW-HTML-SINK <reason> on the same or preceding line. ${GUIDE}`
    );
}

function inlineHandlerError(element: string, attr: string): string {
    return (
        `INLINE-EVENT-HANDLER: Inline event handler ${attr} on <${element}>. ` +
        `Add a ref and handle the event in the component. ` +
        `Suppress with jay-stack: { allow-inline-handler: ["${element}@${attr}"] } in ` +
        `<script type="application/jay-validations">. ${GUIDE}`
    );
}

function javascriptUrlError(element: string, attr: string, scheme: string, value: string): string {
    return (
        `JAVASCRIPT-URL: ${attr} on <${element}> uses a ${scheme} URL, which runs script. ` +
        `Use a ref + event handler. ` +
        `Suppress with jay-stack: { allow-javascript-url: ["${value}"] } in ` +
        `<script type="application/jay-validations">. ${GUIDE}`
    );
}

describe('HTML-STRING-TRUST', () => {
    it('warns HTML-STRING-TRUST at the jay-html element binding an html-string tag', async () => {
        const jayHtml = await parsePage('trust-warn.jay-html');
        expect(checkHtmlStringTrust(jayHtml)).toEqual([
            trustWarning('article.body', 'div'),
            trustWarning('article.sections.body', 'div'),
            trustWarning('article.author.bio', 'aside'),
        ]);
    });

    it('suppresses HTML-STRING-TRUST via allow-html-string in the page script', async () => {
        const jayHtml = await parsePage('trust-allow-all.jay-html');
        expect(checkHtmlStringTrust(jayHtml)).toEqual([]);
    });

    it('suppresses HTML-STRING-TRUST via a bare tag path ["body"]', async () => {
        const jayHtml = await parsePage('trust-allow-bare.jay-html');
        expect(checkHtmlStringTrust(jayHtml)).toEqual([
            trustWarning('article.sections.body', 'div'),
            trustWarning('article.author.bio', 'aside'),
        ]);
    });

    it('suppresses HTML-STRING-TRUST for a nested tag via allow-html-string ["article.sections.body"]', async () => {
        const jayHtml = await parsePage('trust-allow-all.jay-html');
        expect(checkHtmlStringTrust(jayHtml)).not.toEqual(
            expect.arrayContaining([trustWarning('article.sections.body', 'div')]),
        );
    });

    it('suppresses HTML-STRING-TRUST for a linked sub-contract tag via ["article.author.bio"]', async () => {
        const jayHtml = await parsePage('trust-allow-all.jay-html');
        expect(checkHtmlStringTrust(jayHtml)).not.toEqual(
            expect.arrayContaining([trustWarning('article.author.bio', 'aside')]),
        );
    });

    it('suppresses HTML-STRING-TRUST via jay-validations on the headless import', async () => {
        const jayHtml = await parsePage('trust-import-suppressed.jay-html');
        expect(checkHtmlStringTrust(jayHtml)).toEqual([]);
    });
});

/**
 * Round-6 review: the rule must cover the page's own contract tags (no key prefix), and kebab-case
 * contract tags bound in camelCase (`rich-text` → `{richText}`).
 * Expected: a warning per page-own html-string binding, reported in the contract's spelling; an allow-list
 * entry matches in either spelling.
 */
describe('HTML-STRING-TRUST — page contract and tag spelling', () => {
    it('warns for page-own contract html-string tags, including a kebab-case tag bound in camelCase', async () => {
        const jayHtml = await parsePage('trust-page-contract.jay-html');
        expect(checkHtmlStringTrust(jayHtml, fixturesDir)).toEqual([
            trustWarning('bio', 'div'),
            trustWarning('rich-text', 'section'),
        ]);
    });

    it('suppresses a kebab-case tag listed in camelCase spelling ["richText"]', async () => {
        const jayHtml = await parsePage('trust-page-allow-camel.jay-html');
        expect(checkHtmlStringTrust(jayHtml, fixturesDir)).toEqual([trustWarning('bio', 'div')]);
    });

    it('suppresses a kebab-case tag listed in contract spelling ["rich-text"]', async () => {
        const jayHtml = await parsePage('trust-page-allow-kebab.jay-html');
        expect(checkHtmlStringTrust(jayHtml, fixturesDir)).toEqual([trustWarning('bio', 'div')]);
    });
});

describe('RAW-HTML-SINK', () => {
    const sinkPage = (dir: string) => path.join(fixturesDir, dir, 'page.jay-html');

    it('warns RAW-HTML-SINK for innerHTML assignment in page.ts', () => {
        expect(checkRawHtmlSinks(sinkPage('sink-warn'))).toEqual([
            sinkWarning('innerHTML =', 2),
            sinkWarning('outerHTML =', 3),
            sinkWarning('insertAdjacentHTML(', 4),
            sinkWarning('document.write(', 5),
        ]);
    });

    it('suppresses RAW-HTML-SINK via a preceding-line comment with a reason', () => {
        expect(checkRawHtmlSinks(sinkPage('sink-preceding-comment'))).toEqual([]);
    });

    it('suppresses RAW-HTML-SINK via a same-line comment with a reason', () => {
        expect(checkRawHtmlSinks(sinkPage('sink-same-line-comment'))).toEqual([]);
    });

    it('ignores a RAW-HTML-SINK comment without a reason', () => {
        expect(checkRawHtmlSinks(sinkPage('sink-comment-no-reason'))).toEqual([
            sinkWarning('innerHTML =', 3),
        ]);
    });
});

describe('INLINE-EVENT-HANDLER', () => {
    it('errors INLINE-EVENT-HANDLER for onload on inline svg and onclick in jay-html', async () => {
        const jayHtml = await parsePage('inline-handlers.jay-html');
        expect(checkInlineEventHandlers(jayHtml)).toEqual([
            inlineHandlerError('svg', 'onload'),
            inlineHandlerError('img', 'onerror'),
            inlineHandlerError('button', 'onclick'),
        ]);
    });

    it('suppresses INLINE-EVENT-HANDLER via allow-inline-handler ["svg@onload"] only for that element/attr, still erroring img@onerror', async () => {
        const jayHtml = await parsePage('inline-handlers-allowed.jay-html');
        expect(checkInlineEventHandlers(jayHtml)).toEqual([inlineHandlerError('img', 'onerror')]);
    });
});

describe('JAVASCRIPT-URL', () => {
    it('errors JAVASCRIPT-URL for javascript:, uppercase HREF, vbscript:, data:text/html and xlink:href; ignores href="{url}" and data images', async () => {
        const jayHtml = await parsePage('javascript-urls.jay-html');
        expect(checkJavascriptUrls(jayHtml)).toEqual([
            javascriptUrlError('a', 'href', 'javascript:', 'javascript:alert(1)'),
            javascriptUrlError('a', 'href', 'javascript:', 'JavaScript:void(0)'),
            javascriptUrlError('a', 'href', 'vbscript:', 'vbscript:msgbox(1)'),
            javascriptUrlError(
                'iframe',
                'src',
                'data:text/html',
                'data:text/html,<script>alert(1)</script>',
            ),
            javascriptUrlError('a', 'xlink:href', 'javascript:', 'javascript:alert(2)'),
        ]);
    });

    it('suppresses JAVASCRIPT-URL via allow-javascript-url only for the listed value', async () => {
        const jayHtml = await parsePage('javascript-urls-allowed.jay-html');
        expect(checkJavascriptUrls(jayHtml)).toEqual([
            javascriptUrlError('a', 'href', 'javascript:', 'javascript:alert(1)'),
        ]);
    });
});

describe('validateJayFiles wires the html-safety rules', () => {
    it('reports HTML-STRING-TRUST and RAW-HTML-SINK as warnings and the other rules as errors', async () => {
        const result = await validateJayFiles({ path: fixturesDir, projectRoot: fixturesDir });
        const ruleOf = (message: string) => message.split(':')[0];
        const warningRules = new Set(result.warnings.map((w) => ruleOf(w.message)));
        const errorRules = new Set(result.errors.map((e) => ruleOf(e.message)));
        expect([...errorRules].sort()).toEqual(['INLINE-EVENT-HANDLER', 'JAVASCRIPT-URL']);
        expect(warningRules.has('HTML-STRING-TRUST')).toBe(true);
        expect(warningRules.has('RAW-HTML-SINK')).toBe(true);
    });
});
