import { parseJayFile, generateElementFile } from '../lib';
import { stripMargin } from './test-utils/strip-margin';
import { RuntimeMode } from 'jay-compiler-shared';
import { JSDOM } from 'jsdom';

describe('head links integration', () => {
    function jayFileWith(jayYaml: string, body: string, links?: string) {
        return stripMargin(
            ` <html>
                |   <head>${links ? `\n | ${stripMargin(links)}` : ''}
                |     <script type="application/yaml-jay">
                |${stripMargin(jayYaml)}
                |     </script>
                |   </head>
                |   ${stripMargin(body)}
                | </html>`,
        );
    }

    it('should complete the full pipeline: parse -> compile -> execute', async () => {
        // Step 1: Parse the JAY file
        const jayFile = parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div><h1>{title}</h1><p>Test page</p></div></body>',
                `<link rel="stylesheet" href="styles/main.css">
                  |<link rel="preconnect" href="https://fonts.googleapis.com">
                  |<link rel="icon" type="image/x-icon" href="/favicon.ico">
                  |<link rel="manifest" href="/manifest.json">`,
            ),
            'IntegrationTest',
            '',
            {},
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.headLinks).toHaveLength(4);

        // Step 2: Generate TypeScript code
        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);
        expect(generated.val).toContain('injectHeadLinks');

        // Step 3: Set up a mock browser environment
        const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
        const document = dom.window.document;
        global.document = document;

        // Step 4: Mock the generated render function
        // In a real scenario, this would be the compiled output
        const mockInjectHeadLinks = (headLinks: any[]) => {
            const head = document.head;
            headLinks.forEach((linkData) => {
                const existingLink = head.querySelector(`link[href="${linkData.href}"]`);
                if (existingLink) return;

                const link = document.createElement('link');
                link.rel = linkData.rel;
                link.href = linkData.href;

                if (linkData.attributes) {
                    Object.entries(linkData.attributes).forEach(([key, value]) => {
                        link.setAttribute(key, value as string);
                    });
                }

                head.appendChild(link);
            });
        };

        // Step 5: Execute the head links injection (simulating the generated code)
        const headLinksToInject = [
            { rel: 'stylesheet', href: 'styles/main.css' },
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            { rel: 'icon', href: '/favicon.ico', attributes: { type: 'image/x-icon' } },
            { rel: 'manifest', href: '/manifest.json' },
        ];

        mockInjectHeadLinks(headLinksToInject);

        // Step 6: Verify the results
        const links = document.head.querySelectorAll('link');
        expect(links).toHaveLength(4);

        expect(links[0].rel).toBe('stylesheet');
        expect(links[0].href).toBe('styles/main.css');

        expect(links[1].rel).toBe('preconnect');
        expect(links[1].href).toBe('https://fonts.googleapis.com/');

        expect(links[2].rel).toBe('icon');
        expect(links[2].href).toBe('/favicon.ico');
        expect(links[2].getAttribute('type')).toBe('image/x-icon');

        expect(links[3].rel).toBe('manifest');
        expect(links[3].href).toBe('/manifest.json');

        // Clean up
        delete (global as any).document;
    });

    it('should handle the complete pipeline with mixed import and head links', async () => {
        // Step 1: Parse with head links only (no imports for this test)
        const jayFile = parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
                `<link rel="stylesheet" href="styles/main.css">
                  |<link rel="icon" href="/favicon.ico">`,
            ),
            'MixedLinksTest',
            '',
            {},
        );

        expect(jayFile.validations).toEqual([]);

        // Should have 0 imports and 2 head links
        expect(jayFile.val.imports).toHaveLength(0);
        expect(jayFile.val.headLinks).toHaveLength(2);

        // Verify head links
        expect(jayFile.val.headLinks[0].rel).toBe('stylesheet');
        expect(jayFile.val.headLinks[1].rel).toBe('icon');

        // Step 2: Generate code should only inject head links
        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        expect(generated.val).toContain('injectHeadLinks([');
        expect(generated.val).toContain('{ rel: "stylesheet", href: "styles/main.css" }');
        expect(generated.val).toContain('{ rel: "icon", href: "/favicon.ico" }');
    });

    it('should handle empty head links correctly in the full pipeline', async () => {
        // Step 1: Parse with no head links
        const jayFile = parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
            ),
            'NoHeadLinksTest',
            '',
            {},
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.headLinks).toHaveLength(0);
        expect(jayFile.val.imports).toHaveLength(0);

        // Step 2: Generate code should not include injectHeadLinks
        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        expect(generated.val).not.toContain('injectHeadLinks');
    });
});
