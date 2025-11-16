import { parseJayFile, JayImportResolver, Contract, JAY_IMPORT_RESOLVER } from '../../lib';
import {
    JayArrayType,
    JayBoolean,
    JayEnumType,
    JayNumber,
    JayObjectType,
    JayPromiseType,
    JayRecursiveType,
    JayString,
    JayTypeKind,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { stripMargin } from '../test-utils/strip-margin';
import { ResolveTsConfigOptions } from '@jay-framework/compiler-analyze-exported-types';
import { JayType } from '@jay-framework/compiler-shared';

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

        it('should parse async atomic types', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    ` data:
                        |   async name: string
                        |   async email: string`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', {
                    name: new JayPromiseType(JayString),
                    email: new JayPromiseType(JayString),
                }),
            );
        });

        it('should parse async object types', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    ` data:
                        |   async userProfile:
                        |     name: string
                        |     email: string`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', {
                    userProfile: new JayPromiseType(
                        new JayObjectType('UserProfileOfBaseViewState', {
                            name: JayString,
                            email: JayString,
                        }),
                    ),
                }),
            );
        });

        it('should parse async array types', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    ` data:
                        |   async notifications:
                        |     - id: string
                        |       message: string`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', {
                    notifications: new JayPromiseType(
                        new JayArrayType(
                            new JayObjectType('NotificationOfBaseViewState', {
                                id: JayString,
                                message: JayString,
                            }),
                        ),
                    ),
                }),
            );
        });

        describe('recursive types', () => {
            it('should parse direct array recursion (array<$/data>)', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   name: string
                            |   id: string
                            |   children: array<$/data>`,
                        '<body></body>',
                    ),
                    'Tree',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toEqual([]);
                const types = assertObjectType(jayFile.val.types);
                expect(types.name).toBe('TreeViewState');
                expect(types.props.name).toBe(JayString);
                expect(types.props.id).toBe(JayString);

                const childrenArray = assertArrayType(types.props.children);
                const recursiveType = assertRecursiveType(childrenArray.itemType);
                expect(recursiveType.referencePath).toBe('$/data');
                expect(recursiveType.resolvedType).toBe(types);
                expect(recursiveType.name).toBe('TreeViewState');
            });

            it('should parse single optional child recursion ($/data)', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   value: string
                            |   id: string
                            |   next: $/data`,
                        '<body></body>',
                    ),
                    'LinkedList',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toEqual([]);
                const types = assertObjectType(jayFile.val.types);
                expect(types.name).toBe('LinkedListViewState');
                expect(types.props.value).toBe(JayString);
                expect(types.props.id).toBe(JayString);

                const recursiveType = assertRecursiveType(types.props.next as JayRecursiveType);
                expect(recursiveType.referencePath).toBe('$/data');
                expect(recursiveType.resolvedType).toBe(types);
                expect(recursiveType.name).toBe('LinkedListViewState');
            });

            it('should parse indirect recursion through container', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   name: string
                            |   id: string
                            |   submenu:
                            |     title: string
                            |     items: array<$/data>`,
                        '<body></body>',
                    ),
                    'Menu',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toEqual([]);
                const types = assertObjectType(jayFile.val.types);
                expect(types.name).toBe('MenuViewState');

                const submenu = assertObjectType(types.props.submenu);
                expect(submenu.props.title).toBe(JayString);

                const items = assertArrayType(submenu.props.items);
                const recursiveType = assertRecursiveType(items.itemType as JayRecursiveType);
                expect(recursiveType.referencePath).toBe('$/data');
                expect(recursiveType.resolvedType).toBe(types);
                expect(recursiveType.name).toBe('MenuViewState');
            });

            it('should parse indirect array recursion through container', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                                    tree:
                                      - id: string
                                        children: $/data/tree`,
                        '<body></body>',
                    ),
                    'Menu',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toEqual([]);
                const types = assertObjectType(jayFile.val.types);
                expect(types.name).toBe('MenuViewState');

                const tree = assertArrayType(types.props.tree);
                const treeItem = assertObjectType(tree.itemType);
                expect(treeItem.props.id).toBe(JayString);

                const recursive = assertRecursiveType(treeItem.props.children);
                // check the recursion
                expect(recursive.resolvedType).toBe(types.props.tree);
            });

            it('should parse indirect nested array recursion', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        `data:
                                      object1:
                                            arrayObject2:
                                            -     id: string
                                                  arrayObject3:
                                                  -     id: string
                                                        subContract: $/data/object1/arrayObject2/arrayObject3`,
                        '<body></body>',
                    ),
                    'Menu',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toEqual([]);
                const types = assertObjectType(jayFile.val.types);
                expect(types.name).toBe('MenuViewState');

                // Navigate: object1 -> arrayObject2 (array) -> arrayObject3 (array) -> subContract (recursive)
                const object1 = assertObjectType(types.props.object1);
                const arrayObject2 = assertArrayType(object1.props.arrayObject2);
                const arrayObject2Item = assertObjectType(arrayObject2.itemType);
                expect(arrayObject2Item.props.id).toBe(JayString);

                const arrayObject3 = assertArrayType(arrayObject2Item.props.arrayObject3);
                const arrayObject3Item = assertObjectType(arrayObject3.itemType);
                expect(arrayObject3Item.props.id).toBe(JayString);

                const recursive = assertRecursiveType(arrayObject3Item.props.subContract);
                // check the recursion - it should point to arrayObject3 itself
                expect(recursive.referencePath).toBe('$/data/object1/arrayObject2/arrayObject3');
                expect(recursive.resolvedType).toBe(arrayObject3);
            });

            it('should parse link to array property (resolves as array type)', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   title: string
                            |   products:
                            |     - id: string
                            |       name: string
                            |       price: number
                            |   featuredProduct: $/data/products`,
                        '<body></body>',
                    ),
                    'ProductList',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toEqual([]);
                const types = assertObjectType(jayFile.val.types);
                expect(types.name).toBe('ProductListViewState');
                expect(types.props.title).toBe(JayString);

                // products should be an array
                const productsArray = assertArrayType(types.props.products);
                const productType = assertObjectType(productsArray.itemType);
                expect(productType.props.id).toBe(JayString);
                expect(productType.props.name).toBe(JayString);
                expect(productType.props.price).toBe(JayNumber);

                // featuredProduct should be a recursive reference that resolves to the products array
                const recursiveType = assertRecursiveType(
                    types.props.featuredProduct as JayRecursiveType,
                );
                expect(recursiveType.referencePath).toBe('$/data/products');
                expect(recursiveType.resolvedType).toBe(productsArray);
            });

            it('should parse link with [] to unwrap array item type', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   title: string
                            |   products:
                            |     - id: string
                            |       name: string
                            |       price: number
                            |   featuredProduct: $/data/products[]`,
                        '<body></body>',
                    ),
                    'ProductList',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toEqual([]);
                const types = assertObjectType(jayFile.val.types);
                expect(types.name).toBe('ProductListViewState');
                expect(types.props.title).toBe(JayString);

                // products should be an array
                const productsArray = assertArrayType(types.props.products);
                const productType = assertObjectType(productsArray.itemType);
                expect(productType.props.id).toBe(JayString);
                expect(productType.props.name).toBe(JayString);
                expect(productType.props.price).toBe(JayNumber);

                // featuredProduct should be a recursive reference that resolves to the product item type (not the array)
                const recursiveType = assertRecursiveType(
                    types.props.featuredProduct as JayRecursiveType,
                );
                expect(recursiveType.referencePath).toBe('$/data/products[]');
                expect(recursiveType.resolvedType).toBe(productType);
            });

            it('should report error for invalid recursive reference path', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   name: string
                            |   children: array<$/invalid/path>`,
                        '<body></body>',
                    ),
                    'Tree',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations.length).toBeGreaterThan(0);
                expect(jayFile.validations[0]).toContain('invalid recursive reference');
                expect(jayFile.validations[0]).toContain('$/invalid/path');
                expect(jayFile.validations[0]).toContain('must start with "$/data"');
            });

            it('should report error for recursive reference without $ prefix', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   name: string
                            |   children: array<#/data>`,
                        '<body></body>',
                    ),
                    'Tree',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toContain(
                    'invalid type [array<#/data>] found at [data.children]',
                );
            });

            it('should report error for recursive reference to non-existent property', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   tree:
                            |     name: string
                            |     id: string
                            |     children: $/data/nonexistent`,
                        '<body></body>',
                    ),
                    'Tree',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations.length).toBeGreaterThan(0);
                expect(jayFile.validations[0]).toContain('invalid recursive reference');
                expect(jayFile.validations[0]).toContain('$/data/nonexistent');
                expect(jayFile.validations[0]).toContain('Property "nonexistent" not found');
                expect(jayFile.validations[0]).toContain('Available properties');
            });

            it('should report error for malformed array syntax', async () => {
                let jayFile = await parseJayFile(
                    jayFileWith(
                        ` data:
                            |   name: string
                            |   children: array<>`,
                        '<body></body>',
                    ),
                    'Tree',
                    '',
                    {},
                    defaultImportResolver,
                );

                expect(jayFile.validations).toContain(
                    'invalid type [array<>] found at [data.children]',
                );
            });
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
                                    isOptional: false,
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
                                    isOptional: false,
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
                                    isOptional: false,
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
                                    isOptional: false,
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
                                    isOptional: false,
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

function assertArrayType(value: JayType): JayArrayType {
    expect(value.kind).toBe(JayTypeKind.array);
    return value as JayArrayType;
}

function assertObjectType(value: JayType): JayObjectType {
    expect(value.kind).toBe(JayTypeKind.object);
    return value as JayObjectType;
}

function assertRecursiveType(value: JayType): JayRecursiveType {
    expect(value.kind).toBe(JayTypeKind.recursive);
    return value as JayRecursiveType;
}
