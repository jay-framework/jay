import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { runTemplateRules } from '../../lib/css-first/template-rules.js';

function ctx(bodyHtml: string, contractTags: any[] = []) {
    return {
        body: parse(`<body>${bodyHtml}</body>`).querySelector('body')!,
        filePath: 'src/pages/page.jay-html',
        projectRoot: '/project',
        headlessImports: [],
        contract: contractTags.length
            ? { name: 'Page', tags: contractTags }
            : undefined,
    };
}

describe('css-first template rules', () => {
    it('flags javascript: URLs with element context', () => {
        const findings = runTemplateRules(
            ctx('<a href="javascript:void(0)">x</a>') as any,
        );
        expect(findings).toEqual([
            expect.objectContaining({
                ruleId: 'css-first/allow-javascript-url',
                suppressKey: 'allow-javascript-url',
                element: expect.stringContaining('<a'),
            }),
        ]);
    });

    it('treats plain JS braces in onclick as inline handler warning only', () => {
        const findings = runTemplateRules(
            ctx('<button onclick="if (open) { close() }">x</button>', [
                { tag: 'open', type: [0], dataType: { kind: 'primitive', name: 'boolean' } },
            ]) as any,
        );
        expect(findings.some((f) => f.ruleId === 'css-first/bound-inline-event-handler')).toBe(
            false,
        );
        expect(findings).toEqual([
            expect.objectContaining({
                ruleId: 'css-first/allow-inline-event-handlers',
                suppressKey: 'allow-inline-event-handlers',
            }),
        ]);
    });

    it('errors on bound onclick that resolves to contract data', () => {
        const findings = runTemplateRules(
            ctx('<button onclick="track(\'{title}\')">x</button>', [
                { tag: 'title', type: [0], dataType: { kind: 'primitive', name: 'string' } },
            ]) as any,
        );
        expect(findings).toEqual([
            expect.objectContaining({
                ruleId: 'css-first/bound-inline-event-handler',
                severity: 'error',
            }),
        ]);
    });

    it('does not treat non-handler attributes starting with "on" as event handlers', () => {
        const customWidget = runTemplateRules(
            ctx('<my-widget one="1" only="x"></my-widget>') as any,
        );
        expect(customWidget.filter((f) => f.ruleId?.includes('inline-event'))).toHaveLength(0);

        const nativeDiv = runTemplateRules(ctx('<div one="1" only="x"></div>') as any);
        expect(nativeDiv).toEqual([]);

        const inputOnlyif = runTemplateRules(ctx('<input onlyif="x">') as any);
        expect(inputOnlyif).toEqual([]);
    });

    it('flags js lazy-load only when src is missing or a data placeholder', () => {
        const withThumb = runTemplateRules(
            ctx('<img src="thumb.jpg" data-src="full.jpg">') as any,
        );
        expect(withThumb.some((f) => f.ruleId?.endsWith('allow-js-lazy-load'))).toBe(false);

        const noSrc = runTemplateRules(ctx('<img data-src="full.jpg">') as any);
        expect(noSrc).toEqual([
            expect.objectContaining({
                ruleId: 'css-first/allow-js-lazy-load',
            }),
        ]);
    });

    it('emits one scroll-reveal finding per element for multiple data-aos attributes', () => {
        const findings = runTemplateRules(
            ctx('<div data-aos="fade" data-aos-duration="300" data-aos-delay="100"></div>') as any,
        );
        const scrollReveal = findings.filter((f) =>
            f.ruleId?.endsWith('allow-scroll-reveal-library'),
        );
        expect(scrollReveal).toHaveLength(1);
    });
});
