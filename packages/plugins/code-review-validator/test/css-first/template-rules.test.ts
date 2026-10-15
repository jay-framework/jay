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
    it('flags javascript: URLs', () => {
        const findings = runTemplateRules(
            ctx('<a href="javascript:void(0)">x</a>') as any,
        );
        expect(findings.some((f) => f.ruleId?.endsWith('allow-javascript-url'))).toBe(true);
    });

    it('treats plain JS braces in onclick as inline handler warning only', () => {
        const findings = runTemplateRules(
            ctx('<button onclick="if (open) { close() }">x</button>') as any,
        );
        expect(findings.some((f) => f.ruleId?.endsWith('bound-inline-event-handler'))).toBe(
            false,
        );
        expect(findings.some((f) => f.ruleId?.endsWith('allow-inline-event-handlers'))).toBe(
            true,
        );
    });

    it('errors on bound onclick that resolves to contract data', () => {
        const findings = runTemplateRules(
            ctx('<button onclick="track(\'{title}\')">x</button>', [
                { tag: 'title', type: [0], dataType: { kind: 'primitive', name: 'string' } },
            ]) as any,
        );
        expect(findings.some((f) => f.ruleId?.endsWith('bound-inline-event-handler'))).toBe(true);
    });
});
