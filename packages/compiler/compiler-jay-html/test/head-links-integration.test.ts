import { parseJayFile, generateElementFile, JAY_IMPORT_RESOLVER } from '../lib';
import { stripMargin } from './test-utils/strip-margin';
import { RuntimeMode } from '@jay-framework/compiler-shared';
import { JSDOM } from 'jsdom';
import { injectHeadLinks, HeadLink } from '@jay-framework/runtime';

describe('head links integration', () => {
    let dom: JSDOM;
    let document: Document;

    // Test constants
    const TEST_YAML = `data:
                    |   title: string`;
    const TEST_BODY = '<body><div><h1>{title}</h1><p>Test page</p></div></body>';
    const SIMPLE_BODY = '<body><div>{title}</div></body>';

    beforeEach(() => {
        // Set up a fresh DOM environment for each test
        dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
        document = dom.window.document;
        global.document = document;
    });

    afterEach(() => {
        // Clean up global document
        delete (global as any).document;
    });

    function jayFileWith(jayYaml: string, body: string, links?: string) {
        return stripMargin(
            ` <html>
                |   <head>${links ? `\n | ${stripMargin(links)}` : ''}
                |     <script type="application/jay-data">
                |${stripMargin(jayYaml)}
                |     </script>
                |   </head>
                |   ${stripMargin(body)}
                | </html>`,
        );
    }

    it('should parse jay file with head links correctly', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<link rel="stylesheet" href="styles/main.css">
                  |<link rel="preconnect" href="https://fonts.googleapis.com">
                  |<link rel="icon" type="image/x-icon" href="/favicon.ico">
                  |<link rel="manifest" href="/manifest.json">`,
            ),
            'IntegrationTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.headLinks).toHaveLength(4);

        // Verify parsed head links structure
        expect(jayFile.val.headLinks[0].rel).toBe('stylesheet');
        expect(jayFile.val.headLinks[0].href).toBe('styles/main.css');
        expect(jayFile.val.headLinks[1].rel).toBe('preconnect');
        expect(jayFile.val.headLinks[1].href).toBe('https://fonts.googleapis.com');
        expect(jayFile.val.headLinks[2].rel).toBe('icon');
        expect(jayFile.val.headLinks[2].href).toBe('/favicon.ico');
        expect(jayFile.val.headLinks[3].rel).toBe('manifest');
        expect(jayFile.val.headLinks[3].href).toBe('/manifest.json');
    });

    it('should generate typescript code with head links injection', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<link rel="stylesheet" href="styles/main.css">
                  |<link rel="icon" href="/favicon.ico">`,
            ),
            'CodeGenTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // Should import injectHeadLinks from jay-runtime
        expect(generated.val).toMatch(
            /import\s+\{[^}]*injectHeadLinks[^}]*\}\s+from\s+"@jay-framework\/runtime"/,
        );

        // Should call injectHeadLinks with correct parameters
        const callMatch = generated.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatch).not.toBeNull();

        const callString = callMatch![0];
        expect(callString).toContain('{ rel: "stylesheet", href: "styles/main.css" }');
        expect(callString).toContain('{ rel: "icon", href: "/favicon.ico" }');
    });

    it('should inject head links into DOM using runtime function', async () => {
        const headLinksToInject: HeadLink[] = [
            { rel: 'stylesheet', href: 'styles/main.css' },
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            { rel: 'icon', href: '/favicon.ico', attributes: { type: 'image/x-icon' } },
            { rel: 'manifest', href: '/manifest.json' },
        ];

        // Use the actual runtime function
        injectHeadLinks(headLinksToInject);

        const links = document.head.querySelectorAll('link');
        expect(links).toHaveLength(4);

        expect(links[0].rel).toBe('stylesheet');
        expect(links[0].href).toBe('styles/main.css');

        expect(links[1].rel).toBe('preconnect');
        // Browser normalizes URLs and adds trailing slash to domain-only URLs
        expect(links[1].href).toBe('https://fonts.googleapis.com/');

        expect(links[2].rel).toBe('icon');
        expect(links[2].href).toBe('/favicon.ico');
        expect(links[2].getAttribute('type')).toBe('image/x-icon');

        expect(links[3].rel).toBe('manifest');
        expect(links[3].href).toBe('/manifest.json');
    });

    it('should handle head links only (no imports)', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                SIMPLE_BODY,
                `<link rel="stylesheet" href="fixtures/styles/main.css">
                  |<link rel="icon" href="/favicon.ico">
                  |<script type="application/jay-headfull" src="./fixtures/components/imports/component1.ts" names="comp1"></script>`,
            ),
            'HeadLinksOnlyTest',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        // Should have 1 imports and 1 head link (CSS link is excluded when CSS extraction is enabled)
        expect(jayFile.val.imports).toHaveLength(1);
        expect(jayFile.val.headLinks).toHaveLength(1);

        // Verify head links (CSS link is excluded, only icon link remains)
        expect(jayFile.val.headLinks[0].rel).toBe('icon');

        // Generate code should only inject head links
        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        expect(generated.val).toContain('injectHeadLinks([');
        // CSS link should NOT be included in head links when CSS extraction is enabled
        expect(generated.val).not.toContain('{ rel: "stylesheet", href: "fixtures/styles/main.css" }');
        expect(generated.val).toContain('{ rel: "icon", href: "/favicon.ico" }');
    });

    it('should handle empty head links correctly', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(TEST_YAML, SIMPLE_BODY),
            'NoHeadLinksTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.headLinks).toHaveLength(0);
        expect(jayFile.val.imports).toHaveLength(0);

        // Generate code should not include injectHeadLinks
        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        expect(generated.val).not.toContain('injectHeadLinks');
    });

    it('should prevent duplicate head links injection using runtime function', async () => {
        const headLinkData: HeadLink = { rel: 'stylesheet', href: 'styles/main.css' };

        // Inject the same link twice using the actual runtime function
        injectHeadLinks([headLinkData]);
        injectHeadLinks([headLinkData]);

        const links = document.head.querySelectorAll('link[href="styles/main.css"]');
        expect(links).toHaveLength(1); // Should only have one link, not two
    });

    it('should handle missing document.head gracefully', async () => {
        // Temporarily remove document.head
        const originalHead = document.head;
        Object.defineProperty(document, 'head', { value: null, configurable: true });

        const headLinkData: HeadLink = { rel: 'stylesheet', href: 'styles/main.css' };

        // Should not throw an error
        expect(() => injectHeadLinks([headLinkData])).not.toThrow();

        // Restore document.head
        Object.defineProperty(document, 'head', { value: originalHead, configurable: true });
    });

    it('should check for duplicates by both href and rel attributes', async () => {
        // Add a link with same href but different rel
        injectHeadLinks([{ rel: 'stylesheet', href: 'styles/main.css' }]);
        injectHeadLinks([{ rel: 'preload', href: 'styles/main.css' }]); // Same href, different rel

        const stylesheetLinks = document.head.querySelectorAll(
            'link[href="styles/main.css"][rel="stylesheet"]',
        );
        const preloadLinks = document.head.querySelectorAll(
            'link[href="styles/main.css"][rel="preload"]',
        );

        expect(stylesheetLinks).toHaveLength(1);
        expect(preloadLinks).toHaveLength(1);

        // Now try to add the same stylesheet link again - should be prevented
        injectHeadLinks([{ rel: 'stylesheet', href: 'styles/main.css' }]);
        const stylesheetLinksAfter = document.head.querySelectorAll(
            'link[href="styles/main.css"][rel="stylesheet"]',
        );
        expect(stylesheetLinksAfter).toHaveLength(1); // Still only one
    });
});
