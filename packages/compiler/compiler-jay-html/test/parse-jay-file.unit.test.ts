import { parseJayFile } from '../lib';
import {
    JayArrayType,
    JayBoolean,
    JayEnumType,
    JayNumber,
    JayObjectType,
    JayString,
    JayTypeKind,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { stripMargin } from './test-utils/strip-margin';
import { JayImportResolver } from '../lib';
import { Contract } from '../lib';
import { ResolveTsConfigOptions } from '@jay-framework/compiler-analyze-exported-types';
import { JayType } from '@jay-framework/compiler-shared';
import { JAY_IMPORT_RESOLVER } from '../lib';

describe('compiler', () => {
    const defaultImportResolver: JayImportResolver = {
        resolveLink(importingModule: string, link: string): string {
            throw new Error('Not implemented');
        },
        loadContract(fullPath: string): WithValidations<Contract> {
            throw new Error('Not implemented');
        },
        analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[] {
            throw new Error('Not implemented');
        },
    };

    function jayFileWith(jayYaml, body, scripts?) {
        return stripMargin(
            ` <html>
                |   <head>${scripts ? `\n | ${stripMargin(scripts)}` : ''}
                |     <script type="application/jay-data">
                |${stripMargin(jayYaml)}
                |     </script>
                |   </head>
                |   ${stripMargin(body)}
                | </html>`,
        );
    }

    describe('parse jay file', () => {
        it('should parse simple string type with no examples', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   text: string
                        |`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', { text: JayString }),
            );
        });

        it('should append the base name to the view state type', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   text: string
                        |`,
                    '<body></body>',
                ),
                'BaseElementName',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseElementNameViewState', { text: JayString }),
            );
        });

        it('should parse invalid type', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    ` data:
                        |   text: bla`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.validations).toEqual(['invalid type [bla] found at [data.text]']);
        });

        it('should parse complex types', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    ` data:
                        |   s1: string
                        |   n1: number
                        |   b1: boolean
                        |   o1: 
                        |       s2: string
                        |       n2: number
                        |   a1: 
                        |    -  s3: string
                        |       n3: number`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', {
                    s1: JayString,
                    n1: JayNumber,
                    b1: JayBoolean,
                    o1: new JayObjectType('O1OfBaseViewState', {
                        s2: JayString,
                        n2: JayNumber,
                    }),
                    a1: new JayArrayType(
                        new JayObjectType('A1OfBaseViewState', {
                            s3: JayString,
                            n3: JayNumber,
                        }),
                    ),
                }),
            );
        });

        it('should parse enum types', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    ` data:
                        |   an_enum: enum(one | two | three)`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', {
                    an_enum: new JayEnumType('AnEnumOfBaseViewState', ['one', 'two', 'three']),
                }),
            );
        });

        it('should parse import scripts', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    ` data:
                        |   s1: string
                        |   n1: number`,
                    '<body></body>',
                    `<script type="application/jay-headfull" src="./fixtures/components/imports/component1.ts" names="comp1"></script>
                      |<script type="application/jay-headfull" src="./fixtures/components/imports/component2.ts" names="comp2 as comp3"></script>
                      |<script type="application/jay-headfull" src="./fixtures/components/imports/component4.ts" names="comp4" sandbox></script>
                      |<script type="application/jay-headfull" src="./fixtures/components/imports/component5.ts" names="comp5" sandbox="true"></script>
                      |<script type="application/jay-headfull" src="./fixtures/components/imports/component6.ts" names="comp6" sandbox="false"></script>`,
                ),
                'Base',
                './test',
                {},
                JAY_IMPORT_RESOLVER,
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.imports).toEqual(
                expect.arrayContaining([
                    {
                        module: './fixtures/components/imports/component1.ts',
                        names: [
                            {
                                name: 'comp1',
                                type: {
                                    name: 'comp1',
                                    kind: JayTypeKind.imported,
                                    type: {
                                        api: [],
                                        name: 'comp1',
                                        kind: JayTypeKind.component,
                                    },
                                },
                            },
                        ],
                        sandbox: false,
                    },
                    {
                        module: './fixtures/components/imports/component2.ts',
                        names: [
                            {
                                as: 'comp3',
                                name: 'comp2',
                                type: {
                                    name: 'comp3',
                                    kind: JayTypeKind.imported,
                                    type: {
                                        api: [],
                                        name: 'comp2',
                                        kind: JayTypeKind.component,
                                    },
                                },
                            },
                        ],
                        sandbox: false,
                    },
                    {
                        module: './fixtures/components/imports/component4.ts',
                        names: [
                            {
                                name: 'comp4',
                                type: {
                                    name: 'comp4',
                                    kind: JayTypeKind.imported,
                                    type: {
                                        api: [],
                                        name: 'comp4',
                                        kind: JayTypeKind.component,
                                    },
                                },
                            },
                        ],
                        sandbox: true,
                    },
                    {
                        module: './fixtures/components/imports/component5.ts',
                        names: [
                            {
                                name: 'comp5',
                                type: {
                                    name: 'comp5',
                                    kind: JayTypeKind.imported,
                                    type: {
                                        api: [],
                                        name: 'comp5',
                                        kind: JayTypeKind.component,
                                    },
                                },
                            },
                        ],
                        sandbox: true,
                    },
                    {
                        module: './fixtures/components/imports/component6.ts',
                        names: [
                            {
                                name: 'comp6',
                                type: {
                                    name: 'comp6',
                                    kind: JayTypeKind.imported,
                                    type: {
                                        api: [],
                                        name: 'comp6',
                                        kind: JayTypeKind.component,
                                    },
                                },
                            },
                        ],
                        sandbox: false,
                    },
                ]),
            );
        });

        it('should parse namespaces types', async () => {
            let jayFile = await parseJayFile(
                `
                    <html xmlns:svg="http://www.w3.org/2000/svg">
                        <head>
                            <script type="application/jay-data">
                    data:
                    </script>
                    </head>
                    <body>
                    <div>
                    </div>
                    </body>
                    </html>`,
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.namespaces).toEqual([
                { prefix: 'svg', namespace: 'http://www.w3.org/2000/svg' },
            ]);
        });

        it('should report on a file with two jay-data scripts', async () => {
            let jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                |    <head>
                |        <script type="application/jay-data">
                |data:
                |  name: string
                |        </script>
                |        <script type="application/jay-data">
                |data:
                |  name: string
                |        </script>
                |    </head>
                |    <body>x</body>
                |</html>`,
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );
            expect(jayFile.validations).toEqual([
                'jay file should have exactly one jay-data script, found 2',
            ]);
        });

        it('should report on a file without jay-data script', async () => {
            let jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                |    <head>
                |    </head>
                |    <body>x</body>
                |</html>`,
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );
            expect(jayFile.validations).toEqual([
                'jay file should have exactly one jay-data script, found none',
            ]);
        });

        it('should report on a non html file', async () => {
            let jayFile = await parseJayFile(
                `rrgargaergargaerg aergaegaraer aer erager`,
                'Base',
                '',
                {},
                defaultImportResolver,
            );
            expect(jayFile.validations).toEqual([
                'jay file should have exactly one jay-data script, found none',
            ]);
        });

        it('should report on a file without a body', async () => {
            let jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                |    <head>
                |        <script type="application/jay-data">
                |data:
                |  name: string
                |        </script>
                |    </head>
                |</html>`,
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );
            expect(jayFile.validations).toEqual(['jay file must have exactly a body tag']);
        });

        it('should report on import missing names property', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   s1: string
                        |   n1: number`,
                    '<body></body>',
                    '<script type="application/jay-headfull" src="module"></script>',
                ),
                'Base',
                '',
                {},
                JAY_IMPORT_RESOLVER,
            );

            expect(jayFile.validations.length).toEqual(1);
            expect(jayFile.validations[0]).toMatch(
                "failed to parse import names for module module - failed to parse expression [undefined]. Cannot read properties of undefined (reading 'charAt')",
            );
        });

        it('should report on import empty names property', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   s1: string
                        |   n1: number`,
                    '<body></body>',
                    '<script type="application/jay-headfull" src="module" names=""></script>',
                ),
                'Base',
                '',
                {},
                JAY_IMPORT_RESOLVER,
            );

            expect(jayFile.validations.length).toEqual(1);
            expect(jayFile.validations[0]).toMatch(
                'failed to parse import names for module module - failed to parse expression []. Expected identifier but end of input found.',
            );
        });

        it('should report on import file not found', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   s1: string
                        |   n1: number`,
                    '<body></body>',
                    '<script type="application/jay-headfull" src="./module" names="name"></script>',
                ),
                'Base',
                '',
                {},
                JAY_IMPORT_RESOLVER,
            );

            expect(jayFile.validations[0]).toContain(
                'failed to parse import names for module ./module - File not found.',
            );
        });

        describe('head links parsing', () => {
            it('should parse various head link types', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        `data:
                            |   title: string`,
                        '<body></body>',
                        `<link rel="stylesheet" href="styles/main.css">
                          |<link rel="preconnect" href="https://fonts.googleapis.com">
                          |<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                          |<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap">
                          |<link rel="icon" type="image/x-icon" href="/favicon.ico">
                          |<link rel="canonical" href="https://example.com/current-page">
                          |<link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed.xml">
                          |<link rel="manifest" href="/manifest.json">`,
                    ),
                    'Base',
                    '',
                    {},
                    JAY_IMPORT_RESOLVER,
                );

                expect(jayFile.validations).toEqual([]);
                expect(jayFile.val.headLinks).toHaveLength(8);

                // Test stylesheet link
                expect(jayFile.val.headLinks[0]).toEqual({
                    rel: 'stylesheet',
                    href: 'styles/main.css',
                    attributes: {},
                });

                // Test preconnect with crossorigin
                expect(jayFile.val.headLinks[2]).toEqual({
                    rel: 'preconnect',
                    href: 'https://fonts.gstatic.com',
                    attributes: { crossorigin: '' },
                });

                // Test icon with type
                expect(jayFile.val.headLinks[4]).toEqual({
                    rel: 'icon',
                    href: '/favicon.ico',
                    attributes: { type: 'image/x-icon' },
                });

                // Test alternate with multiple attributes
                expect(jayFile.val.headLinks[6]).toEqual({
                    rel: 'alternate',
                    href: '/feed.xml',
                    attributes: { type: 'application/rss+xml', title: 'RSS Feed' },
                });
            });

            it('should exclude import links from head links', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        `data:
                            |   title: string`,
                        '<body></body>',
                        `<link rel="stylesheet" href="styles/main.css">
                          |<link rel="icon" href="/favicon.ico">`,
                    ),
                    'Base',
                    '',
                    {},
                    JAY_IMPORT_RESOLVER,
                );

                expect(jayFile.validations).toEqual([]);
                expect(jayFile.val.headLinks).toHaveLength(2);
                expect(jayFile.val.imports).toHaveLength(0);

                // Only non-import links should be in headLinks
                expect(jayFile.val.headLinks[0].rel).toBe('stylesheet');
                expect(jayFile.val.headLinks[1].rel).toBe('icon');
            });

            it('should handle empty head links', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        `data:
                            |   title: string`,
                        '<body></body>',
                    ),
                    'Base',
                    '',
                    {},
                    JAY_IMPORT_RESOLVER,
                );

                expect(jayFile.validations).toEqual([]);
                expect(jayFile.val.headLinks).toHaveLength(0);
                expect(jayFile.val.imports).toHaveLength(0);
            });

            it('should handle links with no attributes', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        `data:
                            |   title: string`,
                        '<body></body>',
                        `<link rel="stylesheet" href="styles/main.css">
                          |<link rel="preconnect" href="https://fonts.googleapis.com">`,
                    ),
                    'Base',
                    '',
                    {},
                    JAY_IMPORT_RESOLVER,
                );

                expect(jayFile.validations).toEqual([]);
                expect(jayFile.val.headLinks).toHaveLength(2);

                expect(jayFile.val.headLinks[0]).toEqual({
                    rel: 'stylesheet',
                    href: 'styles/main.css',
                    attributes: {},
                });

                expect(jayFile.val.headLinks[1]).toEqual({
                    rel: 'preconnect',
                    href: 'https://fonts.googleapis.com',
                    attributes: {},
                });
            });

            it('should handle links with missing rel or href', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        `data:
                            |   title: string`,
                        '<body></body>',
                        `<link href="styles/main.css">
                          |<link rel="stylesheet">
                          |<link>`,
                    ),
                    'Base',
                    '',
                    {},
                    JAY_IMPORT_RESOLVER,
                );

                expect(jayFile.validations).toEqual([]);
                expect(jayFile.val.headLinks).toHaveLength(3);

                // Missing rel should default to empty string
                expect(jayFile.val.headLinks[0]).toEqual({
                    rel: '',
                    href: 'styles/main.css',
                    attributes: {},
                });

                // Missing href should default to empty string
                expect(jayFile.val.headLinks[1]).toEqual({
                    rel: 'stylesheet',
                    href: '',
                    attributes: {},
                });

                // Missing both should default to empty strings
                expect(jayFile.val.headLinks[2]).toEqual({
                    rel: '',
                    href: '',
                    attributes: {},
                });
            });

            it('should handle complex attributes correctly', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        `data:
                            |   title: string`,
                        '<body></body>',
                        `<link rel="alternate" hreflang="es" href="https://example.com/es/" title="Spanish Version" type="text/html">
                          |<link rel="icon" sizes="32x32" type="image/png" href="/favicon-32x32.png" id="favicon32">`,
                    ),
                    'Base',
                    '',
                    {},
                    JAY_IMPORT_RESOLVER,
                );

                expect(jayFile.validations).toEqual([]);
                expect(jayFile.val.headLinks).toHaveLength(2);

                expect(jayFile.val.headLinks[0]).toEqual({
                    rel: 'alternate',
                    href: 'https://example.com/es/',
                    attributes: {
                        hreflang: 'es',
                        title: 'Spanish Version',
                        type: 'text/html',
                    },
                });

                expect(jayFile.val.headLinks[1]).toEqual({
                    rel: 'icon',
                    href: '/favicon-32x32.png',
                    attributes: {
                        sizes: '32x32',
                        type: 'image/png',
                        id: 'favicon32',
                    },
                });
            });
        });
    });
});
