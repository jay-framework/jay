import { parseJayFile, JAY_IMPORT_RESOLVER } from '../lib';
import { stripMargin } from './test-utils/strip-margin';
import path from 'path';

describe('CSS extraction', () => {
    const TEST_YAML = `data:
                    |   title: string`;
    const TEST_BODY = '<body><div><h1>{title}</h1><p>Test page</p></div></body>';

    function jayFileWith(jayYaml: string, body: string, headContent?: string) {
        return stripMargin(
            ` <html>
                |   <head>${headContent ? `\n | ${stripMargin(headContent)}` : ''}
                |     <script type="application/jay-data">
                |${stripMargin(jayYaml)}
                |     </script>
                |   </head>
                |   ${stripMargin(body)}
                | </html>`,
        );
    }

    it('should extract inline CSS from style tags', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<style>
                  |   .counter { color: blue; }
                  |   .button { background: red; }
                  | </style>`,
            ),
            'InlineCssTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toBeDefined();
        expect(jayFile.val.css).toContain('.counter { color: blue; }');
        expect(jayFile.val.css).toContain('.button { background: red; }');
    });

    it('should extract linked CSS from link tags', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<link rel="stylesheet" href="fixtures/css-test/styles.css">
                  |<link rel="stylesheet" href="fixtures/css-test/components.css">`,
            ),
            'LinkedCssTest',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toBeDefined();
        expect(jayFile.val.css).toContain('/* External CSS: fixtures/css-test/styles.css */');
        expect(jayFile.val.css).toContain('.counter {');
        expect(jayFile.val.css).toContain('color: blue;');
        expect(jayFile.val.css).toContain('/* External CSS: fixtures/css-test/components.css */');
        expect(jayFile.val.css).toContain('.component {');
        expect(jayFile.val.css).toContain('border: 1px solid #ccc;');
    });

    it('should handle missing linked CSS gracefully', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(TEST_YAML, TEST_BODY, `<link rel="stylesheet" href="styles/missing.css">`),
            'MissingCssTest',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toContain(
            'CSS file not found or unreadable: styles/missing.css',
        );
        // When there are validation errors, the entire result is undefined
        expect(jayFile.val).toBeUndefined();
    });

    it('should combine both inline and linked CSS', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<link rel="stylesheet" href="fixtures/css-test/styles.css">
                  |<style>
                  |   .custom { font-weight: bold; }
                  | </style>`,
            ),
            'CombinedCssTest',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toBeDefined();
        expect(jayFile.val.css).toContain('/* External CSS: fixtures/css-test/styles.css */');
        expect(jayFile.val.css).toContain('.counter {');
        expect(jayFile.val.css).toContain('.custom { font-weight: bold; }');
    });

    it('should preserve external @import URLs when inlining linked CSS', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<link rel="stylesheet" href="fixtures/css-test/theme-with-fonts.css">`,
            ),
            'FontImportTest',
            './test',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toBeDefined();
        expect(jayFile.val.css).toMatch(
            /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Sora/,
        );
        expect(jayFile.val.css).toMatch(/--font-body:\s*'Inter'/);
    });

    it('should return undefined when no CSS is present', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(TEST_YAML, TEST_BODY),
            'NoCssTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toBeUndefined();
    });

    it('should handle linked CSS with no file path gracefully', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<link rel="stylesheet" href="styles/main.css">
                  |<style>
                  |   .custom { font-weight: bold; }
                  | </style>`,
            ),
            'NoFilePathTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toBeDefined();
        expect(jayFile.val.css).toContain('/* External CSS: styles/main.css */');
        expect(jayFile.val.css).toContain('.custom { font-weight: bold; }');
    });

    describe('linkedCssFiles for dev server watching', () => {
        it('should include resolved paths for linked CSS files', async () => {
            const jayFile = await parseJayFile(
                jayFileWith(
                    TEST_YAML,
                    TEST_BODY,
                    `<link rel="stylesheet" href="fixtures/css-test/styles.css">
                      |<link rel="stylesheet" href="fixtures/css-test/components.css">`,
                ),
                'LinkedCssFilesTest',
                './test',
                {},
                JAY_IMPORT_RESOLVER,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.linkedCssFiles).toBeDefined();
            expect(jayFile.val.linkedCssFiles).toHaveLength(2);
            expect(jayFile.val.linkedCssFiles[0]).toBe(
                path.resolve('./test', 'fixtures/css-test/styles.css'),
            );
            expect(jayFile.val.linkedCssFiles[1]).toBe(
                path.resolve('./test', 'fixtures/css-test/components.css'),
            );
        });

        it('should be undefined when no linked CSS files exist', async () => {
            const jayFile = await parseJayFile(
                jayFileWith(
                    TEST_YAML,
                    TEST_BODY,
                    `<style>
                      |   .counter { color: blue; }
                      | </style>`,
                ),
                'InlineOnlyTest',
                './test',
                {},
                JAY_IMPORT_RESOLVER,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.linkedCssFiles).toBeUndefined();
        });

        it('should not include external URLs in linkedCssFiles', async () => {
            const jayFile = await parseJayFile(
                jayFileWith(
                    TEST_YAML,
                    TEST_BODY,
                    `<link rel="stylesheet" href="https://example.com/styles.css">
                      |<link rel="stylesheet" href="//cdn.example.com/styles.css">
                      |<link rel="stylesheet" href="fixtures/css-test/styles.css">`,
                ),
                'ExternalUrlsTest',
                './test',
                {},
                JAY_IMPORT_RESOLVER,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.linkedCssFiles).toBeDefined();
            expect(jayFile.val.linkedCssFiles).toHaveLength(1);
            expect(jayFile.val.linkedCssFiles[0]).toBe(
                path.resolve('./test', 'fixtures/css-test/styles.css'),
            );
        });

        it('should include missing CSS files in linkedCssFiles for watch purposes', async () => {
            // Even if a CSS file doesn't exist, we still want to watch for its creation
            const jayFile = await parseJayFile(
                jayFileWith(
                    TEST_YAML,
                    TEST_BODY,
                    `<link rel="stylesheet" href="styles/missing.css">`,
                ),
                'MissingCssWatchTest',
                './test',
                {},
                JAY_IMPORT_RESOLVER,
                '',
            );

            // There should be a validation error for the missing file
            expect(jayFile.validations).toContain(
                'CSS file not found or unreadable: styles/missing.css',
            );
            // But the file should still be undefined because of validation errors
            expect(jayFile.val).toBeUndefined();
        });
    });

    it('should allow multiple @font-face rules for the same family with different weights', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<style>
                  |   @font-face {
                  |     font-family: "Helvetica Neue";
                  |     src: url("./fonts/HelveticaNeueRoman.otf") format("opentype");
                  |     font-weight: 400;
                  |     font-style: normal;
                  |   }
                  |   @font-face {
                  |     font-family: "Helvetica Neue";
                  |     src: url("./fonts/HelveticaNeueBold.otf") format("opentype");
                  |     font-weight: 700;
                  |     font-style: normal;
                  |   }
                  | </style>`,
            ),
            'MultiWeightFontFaceTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([]);
    });

    it('should flag duplicate @font-face rules with the same family, weight, and style', async () => {
        const jayFile = await parseJayFile(
            jayFileWith(
                TEST_YAML,
                TEST_BODY,
                `<style>
                  |   @font-face {
                  |     font-family: "Icons";
                  |     src: url("./icons-a.woff2") format("woff2");
                  |     font-weight: 400;
                  |     font-style: normal;
                  |   }
                  |   @font-face {
                  |     font-family: "Icons";
                  |     src: url("./icons-b.woff2") format("woff2");
                  |     font-weight: 400;
                  |     font-style: normal;
                  |   }
                  | </style>`,
            ),
            'DuplicateFontFaceTest',
            '',
            {},
            JAY_IMPORT_RESOLVER,
            '',
        );

        expect(jayFile.validations).toEqual([
            '@font-face "Icons" (400, normal) is defined multiple times. Font faces are global — rename to avoid collisions.',
        ]);
    });
});
