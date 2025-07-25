import { parseJayFile, generateElementFile, JAY_IMPORT_RESOLVER } from '../../lib';
import { stripMargin } from '../test-utils/strip-margin';
import { prettify, RuntimeMode } from '@jay-framework/compiler-shared';

describe('head links compilation', () => {
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

    it('should generate injectHeadLinks import when head links are present', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
                `<link rel="stylesheet" href="fixtures/styles/main.css">
                  |<link rel="icon" href="/favicon.ico">`,
            ),
            'TestHeadLinks',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // Should import injectHeadLinks
        expect(generated.val).toMatch(
            /import\s+\{[^}]*injectHeadLinks[^}]*\}\s+from\s+"@jay-framework\/runtime"/,
        );

        // Should call injectHeadLinks in render function
        const callMatch = generated.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatch).not.toBeNull();
        const callString = callMatch![0];
        // CSS links should NOT be included in head links when CSS extraction is enabled
        expect(callString).not.toContain('{ rel: "stylesheet", href: "fixtures/styles/main.css" }');
        expect(callString).toContain('{ rel: "icon", href: "/favicon.ico" }');
    });

    it('should not generate injectHeadLinks call when no head links are present', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
            ),
            'TestNoHeadLinks',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // Should not import injectHeadLinks
        expect(generated.val).not.toContain('injectHeadLinks');

        // Should not call injectHeadLinks
        expect(generated.val).not.toContain('injectHeadLinks([');
    });

    it('should generate correct head links array with attributes', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
                `<link rel="stylesheet" href="fixtures/styles/main.css">
                  |<link rel="preconnect" href="https://fonts.googleapis.com">
                  |<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                  |<link rel="icon" type="image/x-icon" href="/favicon.ico">
                  |<link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed.xml">`,
            ),
            'TestComplexHeadLinks',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // Check for proper JSON serialization of head links
        const callMatch = generated.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatch).not.toBeNull();
        const callString = callMatch![0];
        // CSS links should NOT be included in head links when CSS extraction is enabled
        expect(callString).not.toContain('{ rel: "stylesheet", href: "fixtures/styles/main.css" }');
        expect(callString).toContain('{ rel: "preconnect", href: "https://fonts.googleapis.com" }');
        expect(callString).toContain(
            '{ rel: "preconnect", href: "https://fonts.gstatic.com", attributes: {"crossorigin":""} }',
        );
        expect(callString).toContain(
            '{ rel: "icon", href: "/favicon.ico", attributes: {"type":"image/x-icon"} }',
        );
        expect(callString).toContain(
            '{ rel: "alternate", href: "/feed.xml", attributes: {"type":"application/rss+xml","title":"RSS Feed"} }',
        );
    });

    it('should exclude import links from head links injection', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
                `<link rel="stylesheet" href="fixtures/styles/main.css">
                  |<link rel="import" href="./fixtures/components/imports/component1.ts" names="comp1"/>
                  |<link rel="icon" href="/favicon.ico">`,
            ),
            'TestWithImports',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // Should inject non-import links (but not CSS links when CSS extraction is enabled)
        const callMatch = generated.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatch).not.toBeNull();
        const callString = callMatch![0];
        // CSS links should NOT be included in head links when CSS extraction is enabled
        expect(callString).not.toContain('{ rel: "stylesheet", href: "fixtures/styles/main.css" }');
        expect(callString).toContain('{ rel: "icon", href: "/favicon.ico" }');
        // Should not inject import links
        expect(callString).not.toContain('my-component.html');
    });

    it('should handle empty head links array correctly', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
            ),
            'TestEmptyHeadLinks',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // Should not import or call injectHeadLinks
        expect(generated.val).not.toContain('injectHeadLinks');
    });

    it('should position injectHeadLinks call correctly in render function', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
                `<link rel="stylesheet" href="styles/main.css">`,
            ),
            'TestPosition',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // When no file path is provided, CSS links should still be included in head links
        const callMatch = generated.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatch).not.toBeNull();
        const callString = callMatch![0];
        expect(callString).toContain('{ rel: "stylesheet", href: "styles/main.css" }');

        // Check that injectHeadLinks is called after ReferencesManager setup but before render function definition
        const lines = generated.val.split('\n');
        const referencesManagerLine = lines.findIndex((line) =>
            line.includes('ReferencesManager.for'),
        );
        const injectHeadLinksLine = lines.findIndex((line) => line.includes('injectHeadLinks(['));
        const renderFunctionLine = lines.findIndex((line) =>
            line.includes('const render = (viewState:'),
        );

        expect(referencesManagerLine).toBeGreaterThan(-1);
        expect(injectHeadLinksLine).toBeGreaterThan(-1);
        expect(renderFunctionLine).toBeGreaterThan(-1);

        expect(injectHeadLinksLine).toBeGreaterThan(referencesManagerLine);
        expect(renderFunctionLine).toBeGreaterThan(injectHeadLinksLine);
    });

    it('should work with different runtime modes', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
                `<link rel="stylesheet" href="styles/main.css">`,
            ),
            'TestRuntimeMode',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        // Test MainTrusted mode
        const generatedTrusted = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generatedTrusted.validations).toEqual([]);
        let callMatchTrusted = generatedTrusted.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatchTrusted).not.toBeNull();
        // When no file path is provided, CSS links should still be included in head links
        expect(callMatchTrusted![0]).toContain('{ rel: "stylesheet", href: "styles/main.css" }');

        // Test MainSandbox mode
        const generatedSandbox = generateElementFile(jayFile.val, RuntimeMode.MainSandbox);
        expect(generatedSandbox.validations).toEqual([]);
        let callMatchSandbox = generatedSandbox.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatchSandbox).not.toBeNull();
        // When no file path is provided, CSS links should still be included in head links
        expect(callMatchSandbox![0]).toContain('{ rel: "stylesheet", href: "styles/main.css" }');
    });

    it('should handle special characters in href and attributes', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                `data:
                    |   title: string`,
                '<body><div>{title}</div></body>',
                `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400&display=swap">
                  |<link rel="alternate" title='Site "Main" Page' href="/page with spaces.html">`,
            ),
            'TestSpecialChars',
            '',
            {},
            JAY_IMPORT_RESOLVER,
        );

        expect(jayFile.validations).toEqual([]);

        const generated = generateElementFile(jayFile.val, RuntimeMode.MainTrusted);
        expect(generated.validations).toEqual([]);

        // Should properly escape special characters in JSON
        const callMatch = generated.val.match(/injectHeadLinks\(\[[\s\S]*?\]\)/);
        expect(callMatch).not.toBeNull();
        const callString = callMatch![0];
        expect(callString).toContain(
            'https://fonts.googleapis.com/css2?family=Inter:wght@300;400&display=swap',
        );
        expect(callString).toContain('/page with spaces.html');
        expect(callString).toContain('Site \\"Main\\" Page');
    });
});
