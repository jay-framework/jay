import {
    parseJayFile,
    JayImportResolver,
    Contract,
    ContractTagType,
    JAY_IMPORT_RESOLVER,
} from '../../lib';
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
        resolvePluginComponent(pluginName: string, contractName: string, projectRoot: string) {
            // Handle test plugins
            // These tests don't use real fixture files, so just return simple paths
            if (pluginName === 'test-counter' && contractName === 'counter') {
                return new WithValidations(
                    {
                        contractPath: '/path/to/counter.jay-contract',
                        componentPath: '/path/to/counter',
                        componentName: 'counter',
                    },
                    [],
                );
            }
            if (pluginName === 'test-named-counter' && contractName === 'named-counter') {
                return new WithValidations(
                    {
                        contractPath: '/path/to/named-counter.jay-contract',
                        componentPath: '/path/to/named-counter',
                        componentName: 'namedCounter',
                    },
                    [],
                );
            }
            if (pluginName === 'test-timer' && contractName === 'timer') {
                return new WithValidations(
                    {
                        contractPath: '/path/to/timer.jay-contract',
                        componentPath: '/path/to/timer',
                        componentName: 'timer',
                    },
                    [],
                );
            }
            return new WithValidations(null as any, [`Plugin "${pluginName}" not found in test`]);
        },
        loadPluginContract(pluginName: string, contractName: string, projectRoot: string) {
            return new WithValidations(null as any, [
                `Plugin contract loading not supported in this test`,
            ]);
        },
        resolvePluginManifest(pluginName: string, projectRoot: string) {
            return new WithValidations(null as any, [
                `Plugin manifest resolution not supported in this test`,
            ]);
        },
        readJayHtml() {
            return null;
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
                '',
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', { text: JayString }),
            );
        });

        it('should preserve underscore prefix in data property names like _id', async () => {
            let jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   _id: string
                        |   _name: string
                        |`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
                defaultImportResolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', {
                    _id: JayString,
                    _name: JayString,
                }),
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
                '',
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
                '',
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
                '',
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
                '',
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
                '',
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
                '',
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
                '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                '',
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
                '',
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
                '',
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
                '',
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
                '',
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
                '',
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
                '',
            );

            expect(jayFile.validations.length).toEqual(1);
            expect(jayFile.validations[0]).toMatch(
                'failed to parse import names for module module - Failed to parse expression [undefined]',
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
                '',
            );

            expect(jayFile.validations.length).toEqual(1);
            expect(jayFile.validations[0]).toMatch(
                'failed to parse import names for module module - Failed to parse expression []',
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
                '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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
                    '',
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

    describe('contract merging', () => {
        it('should NOT create contract when no explicit contract and no headless imports', async () => {
            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |   count: number
                        |   isActive: boolean
                        |`,
                    '<body></body>',
                ),
                'Page',
                '',
                {},
                defaultImportResolver,
                '',
            );

            // Backward compatible: no contract auto-generation for inline data only
            expect(jayFile.val.contract).toBeUndefined();
            // But trackByMaps should be empty
            expect(jayFile.val.serverTrackByMap).toBeUndefined();
            expect(jayFile.val.clientTrackByMap).toBeUndefined();
        });

        it('should preserve page contract when no headless imports', async () => {
            const pageContract: Contract = {
                name: 'testPage',
                tags: [
                    {
                        tag: 'title',
                        type: [ContractTagType.data],
                        dataType: JayString,
                    },
                ],
            };

            const resolverWithPageContract: JayImportResolver = {
                ...defaultImportResolver,
                loadContract(fullPath: string): WithValidations<Contract> {
                    return new WithValidations(pageContract, []);
                },
                resolveLink(importingModule: string, link: string): string {
                    return '/path/to/page.jay-contract';
                },
            };

            const jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                    |   <head>
                    |     <script type="application/jay-data" contract="./page.jay-contract"></script>
                    |   </head>
                    |   <body></body>
                    | </html>`,
                ),
                'Page',
                '',
                {},
                resolverWithPageContract,
                '',
            );

            expect(jayFile.val.contract).toEqual({
                name: 'testPage',
                tags: [{ tag: 'title', type: [ContractTagType.data], dataType: JayString }],
            });
        });

        it('should extract trackBy from headless contracts even without page contract', async () => {
            const counterContract: Contract = {
                name: 'counter',
                tags: [
                    {
                        tag: 'items',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            {
                                tag: 'id',
                                type: [ContractTagType.data],
                                dataType: JayString,
                            },
                            {
                                tag: 'count',
                                type: [ContractTagType.data],
                                dataType: JayNumber,
                            },
                        ],
                    },
                ],
            };

            const resolverWithCounter: JayImportResolver = {
                ...defaultImportResolver,
                loadContract(fullPath: string): WithValidations<Contract> {
                    if (fullPath.includes('counter')) {
                        return new WithValidations(counterContract, []);
                    }
                    throw new Error('Unexpected contract path');
                },
                loadPluginContract(pluginName: string, contractName: string, projectRoot: string) {
                    if (pluginName === 'test-counter' && contractName === 'counter') {
                        return new WithValidations(
                            {
                                contract: counterContract,
                                contractPath: '/path/to/counter.jay-contract',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, [`Plugin not found`]);
                },
                resolveLink(importingModule: string, link: string): string {
                    return '/path/to/counter.jay-contract';
                },
            };

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    '<body></body>',
                    `<script type="application/jay-headless" plugin="test-counter" contract="counter" key="myCounter"></script>`,
                ),
                'Page',
                '',
                {},
                resolverWithCounter,
                '',
            );

            // No contract auto-generation (backward compatible)
            expect(jayFile.val.contract).toBeUndefined();

            // But trackByMaps should be extracted from headless contract
            // Both maps are equal since there are no fast+interactive arrays
            expect(jayFile.val.serverTrackByMap).toEqual({
                'myCounter.items': 'id',
            });
            expect(jayFile.val.clientTrackByMap).toEqual({
                'myCounter.items': 'id',
            });
        });

        it('should preserve page contract and extract trackBy from headless contracts', async () => {
            const pageContract: Contract = {
                name: 'testPage',
                tags: [
                    {
                        tag: 'items',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'itemId',
                        tags: [
                            {
                                tag: 'itemId',
                                type: [ContractTagType.data],
                                dataType: JayString,
                            },
                            {
                                tag: 'title',
                                type: [ContractTagType.data],
                                dataType: JayString,
                            },
                        ],
                    },
                ],
            };

            const counterContract: Contract = {
                name: 'counter',
                tags: [
                    {
                        tag: 'entries',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            {
                                tag: 'id',
                                type: [ContractTagType.data],
                                dataType: JayNumber,
                            },
                            {
                                tag: 'count',
                                type: [ContractTagType.data],
                                dataType: JayNumber,
                            },
                        ],
                    },
                ],
            };

            const resolverWithBoth: JayImportResolver = {
                ...defaultImportResolver,
                loadContract(fullPath: string): WithValidations<Contract> {
                    if (fullPath.includes('page')) {
                        return new WithValidations(pageContract, []);
                    }
                    if (fullPath.includes('counter')) {
                        return new WithValidations(counterContract, []);
                    }
                    throw new Error('Unexpected contract path');
                },
                loadPluginContract(pluginName: string, contractName: string, projectRoot: string) {
                    if (pluginName === 'test-counter' && contractName === 'counter') {
                        return new WithValidations(
                            {
                                contract: counterContract,
                                contractPath: '/path/to/counter.jay-contract',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, [`Plugin not found`]);
                },
                resolveLink(importingModule: string, link: string): string {
                    if (link.includes('page')) return '/path/to/page.jay-contract';
                    if (link.includes('counter')) return '/path/to/counter.jay-contract';
                    throw new Error('Unexpected link');
                },
            };

            const jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                    |   <head>
                    |     <script type="application/jay-headless" plugin="test-counter" contract="counter" key="myCounter"></script>
                    |     <script type="application/jay-data" contract="./page.jay-contract"></script>
                    |   </head>
                    |   <body></body>
                    | </html>`,
                ),
                'Page',
                '',
                {},
                resolverWithBoth,
                '',
            );

            // Page contract preserved (not merged with headless)
            expect(jayFile.val.contract).toEqual(pageContract);

            // TrackBy extracted from both page and headless contracts
            // Both maps are equal since there are no fast+interactive arrays
            expect(jayFile.val.serverTrackByMap).toEqual({
                items: 'itemId',
                'myCounter.entries': 'id',
            });
            expect(jayFile.val.clientTrackByMap).toEqual({
                items: 'itemId',
                'myCounter.entries': 'id',
            });
        });

        it('should extract trackBy from multiple headless contracts', async () => {
            const pageContract: Contract = {
                name: 'testPage',
                tags: [
                    {
                        tag: 'title',
                        type: [ContractTagType.data],
                        dataType: JayString,
                    },
                ],
            };

            const counterContract: Contract = {
                name: 'counter',
                tags: [
                    {
                        tag: 'counts',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'countId',
                        tags: [
                            {
                                tag: 'countId',
                                type: [ContractTagType.data],
                                dataType: JayString,
                            },
                            {
                                tag: 'value',
                                type: [ContractTagType.data],
                                dataType: JayNumber,
                            },
                        ],
                    },
                ],
            };

            const timerContract: Contract = {
                name: 'timer',
                tags: [
                    {
                        tag: 'intervals',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'intervalId',
                        tags: [
                            {
                                tag: 'intervalId',
                                type: [ContractTagType.data],
                                dataType: JayNumber,
                            },
                            {
                                tag: 'seconds',
                                type: [ContractTagType.data],
                                dataType: JayNumber,
                            },
                        ],
                    },
                ],
            };

            const resolverWithMultiple: JayImportResolver = {
                ...defaultImportResolver,
                loadContract(fullPath: string): WithValidations<Contract> {
                    if (fullPath.includes('page')) {
                        return new WithValidations(pageContract, []);
                    }
                    if (fullPath.includes('counter')) {
                        return new WithValidations(counterContract, []);
                    }
                    if (fullPath.includes('timer')) {
                        return new WithValidations(timerContract, []);
                    }
                    throw new Error('Unexpected contract path');
                },
                loadPluginContract(pluginName: string, contractName: string, projectRoot: string) {
                    if (pluginName === 'test-counter' && contractName === 'counter') {
                        return new WithValidations(
                            {
                                contract: counterContract,
                                contractPath: '/path/to/counter.jay-contract',
                            },
                            [],
                        );
                    }
                    if (pluginName === 'test-timer' && contractName === 'timer') {
                        return new WithValidations(
                            {
                                contract: timerContract,
                                contractPath: '/path/to/timer.jay-contract',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, [`Plugin not found`]);
                },
                resolveLink(importingModule: string, link: string): string {
                    if (link.includes('page')) return '/path/to/page.jay-contract';
                    if (link.includes('counter')) return '/path/to/counter.jay-contract';
                    if (link.includes('timer')) return '/path/to/timer.jay-contract';
                    throw new Error('Unexpected link');
                },
            };

            const jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                    |   <head>
                    |     <script type="application/jay-headless" plugin="test-counter" contract="counter" key="myCounter"></script>
                    |     <script type="application/jay-headless" plugin="test-timer" contract="timer" key="myTimer"></script>
                    |     <script type="application/jay-data" contract="./page.jay-contract"></script>
                    |   </head>
                    |   <body></body>
                    | </html>`,
                ),
                'Page',
                '',
                {},
                resolverWithMultiple,
                '',
            );

            // Page contract preserved
            expect(jayFile.val.contract).toEqual(pageContract);

            // TrackBy extracted from both headless contracts
            // Both maps are equal since there are no fast+interactive arrays
            expect(jayFile.val.serverTrackByMap).toEqual({
                'myCounter.counts': 'countId',
                'myTimer.intervals': 'intervalId',
            });
            expect(jayFile.val.clientTrackByMap).toEqual({
                'myCounter.counts': 'countId',
                'myTimer.intervals': 'intervalId',
            });
        });

        it('should exclude fast+interactive arrays from clientTrackByMap', async () => {
            const pageContract: Contract = {
                name: 'searchPage',
                tags: [
                    {
                        tag: 'staticItems',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        phase: 'slow', // Static array - structure defined at slow phase
                        tags: [
                            { tag: 'id', type: [ContractTagType.data], dataType: JayString },
                            { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                        ],
                    },
                    {
                        tag: 'searchResults',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        phase: 'fast+interactive', // Dynamic array - can be replaced by interactive
                        tags: [
                            { tag: 'id', type: [ContractTagType.data], dataType: JayString },
                            { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                        ],
                    },
                ],
            };

            const resolverWithDynamicArray: JayImportResolver = {
                ...defaultImportResolver,
                loadContract(fullPath: string): WithValidations<Contract> {
                    return new WithValidations(pageContract, []);
                },
                resolveLink(importingModule: string, link: string): string {
                    return '/path/to/page.jay-contract';
                },
            };

            const jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                    |   <head>
                    |     <script type="application/jay-data" contract="./page.jay-contract"></script>
                    |   </head>
                    |   <body></body>
                    | </html>`,
                ),
                'Page',
                '',
                {},
                resolverWithDynamicArray,
                '',
            );

            // Server needs trackBy for both arrays (slow → fast merge)
            expect(jayFile.val.serverTrackByMap).toEqual({
                staticItems: 'id',
                searchResults: 'id',
            });

            // Client excludes fast+interactive array (interactive can replace it entirely)
            expect(jayFile.val.clientTrackByMap).toEqual({
                staticItems: 'id',
                // searchResults is NOT here - it's dynamic
            });
        });

        it('should alias colliding enum names from different contracts with different values', async () => {
            // Contract A has enum tag "status" → Status with values ACTIVE | INACTIVE
            const contractA: Contract = {
                name: 'widgetA',
                tags: [
                    {
                        tag: 'label',
                        type: [ContractTagType.data],
                        dataType: JayString,
                    },
                    {
                        tag: 'status',
                        type: [ContractTagType.variant],
                        dataType: new JayEnumType('Status', ['ACTIVE', 'INACTIVE']),
                    },
                ],
            };

            // Contract B has enum tag "status" → Status with values PENDING | DONE
            const contractB: Contract = {
                name: 'widgetB',
                tags: [
                    {
                        tag: 'title',
                        type: [ContractTagType.data],
                        dataType: JayString,
                    },
                    {
                        tag: 'status',
                        type: [ContractTagType.variant],
                        dataType: new JayEnumType('Status', ['PENDING', 'DONE']),
                    },
                ],
            };

            const resolver: JayImportResolver = {
                ...defaultImportResolver,
                resolvePluginComponent(pluginName: string, contractName: string) {
                    if (pluginName === 'test-widget-a' && contractName === 'widget-a') {
                        return new WithValidations(
                            {
                                contractPath: '/plugins/widget-a/widget-a.jay-contract',
                                componentPath: '/plugins/widget-a/widget-a',
                                componentName: 'widgetA',
                            },
                            [],
                        );
                    }
                    if (pluginName === 'test-widget-b' && contractName === 'widget-b') {
                        return new WithValidations(
                            {
                                contractPath: '/plugins/widget-b/widget-b.jay-contract',
                                componentPath: '/plugins/widget-b/widget-b',
                                componentName: 'widgetB',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, [`Plugin not found`]);
                },
                loadPluginContract(pluginName: string, contractName: string) {
                    if (pluginName === 'test-widget-a' && contractName === 'widget-a') {
                        return new WithValidations(
                            {
                                contract: contractA,
                                contractPath: '/plugins/widget-a/widget-a.jay-contract',
                            },
                            [],
                        );
                    }
                    if (pluginName === 'test-widget-b' && contractName === 'widget-b') {
                        return new WithValidations(
                            {
                                contract: contractB,
                                contractPath: '/plugins/widget-b/widget-b.jay-contract',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, [`Plugin not found`]);
                },
                loadContract(fullPath: string): WithValidations<Contract> {
                    if (fullPath.includes('widget-a')) return new WithValidations(contractA, []);
                    if (fullPath.includes('widget-b')) return new WithValidations(contractB, []);
                    throw new Error('Unexpected contract path: ' + fullPath);
                },
                resolveLink(importingModule: string, link: string): string {
                    return '/resolved/' + link;
                },
            };

            const jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                    |   <head>
                    |     <script type="application/jay-headless" plugin="test-widget-a" contract="widget-a" key="a"></script>
                    |     <script type="application/jay-headless" plugin="test-widget-b" contract="widget-b" key="b"></script>
                    |     <script type="application/jay-data">data:</script>
                    |   </head>
                    |   <body></body>
                    | </html>`,
                ),
                'Page',
                '',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.headlessImports).toHaveLength(2);

            // The first contract's enum should keep its original name
            const importA = jayFile.val.headlessImports.find((i) => i.contractName === 'widget-a')!;
            const enumFromA = importA.contractLinks
                .flatMap((l) => l.names)
                .find((n) => n.type instanceof JayEnumType);
            expect(enumFromA).toBeDefined();
            expect(enumFromA!.name).toEqual('Status');
            expect(enumFromA!.as).toBeUndefined();
            expect((enumFromA!.type as JayEnumType).alias).toBeUndefined();

            // The second contract's enum should be aliased to avoid collision
            const importB = jayFile.val.headlessImports.find((i) => i.contractName === 'widget-b')!;
            const enumFromB = importB.contractLinks
                .flatMap((l) => l.names)
                .find((n) => n.type instanceof JayEnumType);
            expect(enumFromB).toBeDefined();
            expect(enumFromB!.name).toEqual('Status');
            expect(enumFromB!.as).toEqual('Status$1');
            expect((enumFromB!.type as JayEnumType).alias).toEqual('Status$1');
        });

        it('should alias enums with same name even when values match across different contracts', async () => {
            // Even identical enums from different modules must be aliased —
            // same values in different order would produce different numeric indices
            const contractC: Contract = {
                name: 'widgetC',
                tags: [
                    {
                        tag: 'mode',
                        type: [ContractTagType.variant],
                        dataType: new JayEnumType('Mode', ['LIGHT', 'DARK']),
                    },
                ],
            };

            const contractD: Contract = {
                name: 'widgetD',
                tags: [
                    {
                        tag: 'mode',
                        type: [ContractTagType.variant],
                        dataType: new JayEnumType('Mode', ['LIGHT', 'DARK']),
                    },
                ],
            };

            const resolver: JayImportResolver = {
                ...defaultImportResolver,
                resolvePluginComponent(pluginName: string, contractName: string) {
                    if (pluginName === 'test-widget-c' && contractName === 'widget-c') {
                        return new WithValidations(
                            {
                                contractPath: '/plugins/widget-c/widget-c.jay-contract',
                                componentPath: '/plugins/widget-c/widget-c',
                                componentName: 'widgetC',
                            },
                            [],
                        );
                    }
                    if (pluginName === 'test-widget-d' && contractName === 'widget-d') {
                        return new WithValidations(
                            {
                                contractPath: '/plugins/widget-d/widget-d.jay-contract',
                                componentPath: '/plugins/widget-d/widget-d',
                                componentName: 'widgetD',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, [`Plugin not found`]);
                },
                loadPluginContract(pluginName: string, contractName: string) {
                    if (pluginName === 'test-widget-c' && contractName === 'widget-c') {
                        return new WithValidations(
                            {
                                contract: contractC,
                                contractPath: '/plugins/widget-c/widget-c.jay-contract',
                            },
                            [],
                        );
                    }
                    if (pluginName === 'test-widget-d' && contractName === 'widget-d') {
                        return new WithValidations(
                            {
                                contract: contractD,
                                contractPath: '/plugins/widget-d/widget-d.jay-contract',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, [`Plugin not found`]);
                },
                loadContract(fullPath: string): WithValidations<Contract> {
                    if (fullPath.includes('widget-c')) return new WithValidations(contractC, []);
                    if (fullPath.includes('widget-d')) return new WithValidations(contractD, []);
                    throw new Error('Unexpected contract path: ' + fullPath);
                },
                resolveLink(importingModule: string, link: string): string {
                    return '/resolved/' + link;
                },
            };

            const jayFile = await parseJayFile(
                stripMargin(
                    `<html>
                    |   <head>
                    |     <script type="application/jay-headless" plugin="test-widget-c" contract="widget-c" key="c"></script>
                    |     <script type="application/jay-headless" plugin="test-widget-d" contract="widget-d" key="d"></script>
                    |     <script type="application/jay-data">data:</script>
                    |   </head>
                    |   <body></body>
                    | </html>`,
                ),
                'Page',
                '',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);

            // Same name from different modules — second should still be aliased
            const firstImport = jayFile.val.headlessImports[0];
            const firstEnum = firstImport.contractLinks
                .flatMap((l) => l.names)
                .find((n) => n.type instanceof JayEnumType);
            expect(firstEnum).toBeDefined();
            expect(firstEnum!.as).toBeUndefined();
            expect((firstEnum!.type as JayEnumType).alias).toBeUndefined();

            const secondImport = jayFile.val.headlessImports[1];
            const secondEnum = secondImport.contractLinks
                .flatMap((l) => l.names)
                .find((n) => n.type instanceof JayEnumType);
            expect(secondEnum).toBeDefined();
            expect(secondEnum!.as).toEqual('Mode$1');
            expect((secondEnum!.type as JayEnumType).alias).toEqual('Mode$1');
        });
    });

    describe('headfull full-stack imports', () => {
        const headerContract: Contract = {
            name: 'Header',
            tags: [
                {
                    tag: 'logo-url',
                    type: [ContractTagType.data],
                    dataType: JayString,
                    phase: 'slow',
                },
                {
                    tag: 'cart-count',
                    type: [ContractTagType.data],
                    dataType: JayNumber,
                    phase: 'fast+interactive',
                },
                {
                    tag: 'increment',
                    type: [ContractTagType.interactive],
                    elementType: ['HTMLButtonElement'],
                },
            ],
        };

        const headerJayHtml = `<html>
<head>
    <script type="application/jay-data">
        data:
            logoUrl: string
            cartCount: number
    </script>
</head>
<body>
    <header>
        <img src="{logoUrl}" />
        <span>{cartCount}</span>
        <button ref="increment">+</button>
    </header>
</body>
</html>`;

        function makeHeadfullFSResolver(
            overrides: Partial<JayImportResolver> = {},
        ): JayImportResolver {
            return {
                ...defaultImportResolver,
                loadContract(fullPath: string): WithValidations<Contract> {
                    if (fullPath.includes('header')) {
                        return new WithValidations(headerContract, []);
                    }
                    throw new Error(`Unexpected contract path: ${fullPath}`);
                },
                resolveLink(importingModule: string, link: string): string {
                    if (link.includes('header')) return '/components/header/header';
                    return '/resolved/' + link;
                },
                readJayHtml(importingModuleDir: string, src: string): string | null {
                    if (src.includes('header')) return headerJayHtml;
                    return null;
                },
                ...overrides,
            };
        }

        it('should parse headfull FS import and create headlessImports entry', async () => {
            const resolver = makeHeadfullFSResolver();

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body>
                        |   <h1>{title}</h1>
                        |   <jay:header logoUrl="/logo.png" />
                        | </body>`,
                    `<script type="application/jay-headfull"
                        |   src="./header/header"
                        |   contract="./header/header.jay-contract"
                        |   names="header"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.headlessImports).toHaveLength(1);

            const headlessImport = jayFile.val.headlessImports[0];
            expect(headlessImport.contractName).toEqual('header');
            expect(headlessImport.contract).toEqual(headerContract);
            expect(headlessImport.codeLink.names[0].name).toEqual('header');
        });

        it('should inject jay-html body content into <jay:Name> tags', async () => {
            const resolver = makeHeadfullFSResolver();

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body>
                        |   <h1>{title}</h1>
                        |   <jay:header logoUrl="/logo.png" />
                        | </body>`,
                    `<script type="application/jay-headfull"
                        |   src="./header/header"
                        |   contract="./header/header.jay-contract"
                        |   names="header"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            // After injection, the <jay:header> tag should have the component's body content
            const jayTag = jayFile.val.body
                .querySelectorAll('*')
                .find((el) => el.tagName?.toLowerCase() === 'jay:header');
            expect(jayTag).toBeDefined();
            expect(jayTag.querySelector('header')).toBeTruthy();
            expect(jayTag.querySelector('button')).toBeTruthy();
        });

        it('should not treat headfull imports without contract as full-stack', async () => {
            // Regular headfull import (no contract) should still be processed as JayImportLink
            const resolver: JayImportResolver = {
                ...defaultImportResolver,
                resolveLink(importingModule: string, link: string): string {
                    return '/resolved/' + link;
                },
                analyzeExportedTypes() {
                    return [new JayObjectType('counter', { count: JayNumber })];
                },
                readJayHtml() {
                    return null;
                },
            };

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body><div>{title}</div></body>`,
                    `<script type="application/jay-headfull"
                        |   src="./counter"
                        |   names="counter"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            // No headless imports — regular headfull import is a JayImportLink
            expect(jayFile.val.headlessImports).toHaveLength(0);
            // But the import should still be in the imports array
            expect(jayFile.val.imports.some((i) => i.names.some((n) => n.name === 'counter'))).toBe(
                true,
            );
        });

        it('should error when jay-html file is not found', async () => {
            const resolver = makeHeadfullFSResolver({
                readJayHtml() {
                    return null;
                },
            });

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body><jay:header /></body>`,
                    `<script type="application/jay-headfull"
                        |   src="./header/header"
                        |   contract="./header/header.jay-contract"
                        |   names="header"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations.length).toBeGreaterThan(0);
            expect(jayFile.validations[0]).toMatch(/jay-html file not found/);
        });

        it('should skip injection when <jay:Name> already has children', async () => {
            const resolver = makeHeadfullFSResolver();

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body>
                        |   <jay:header logoUrl="/logo.png">
                        |       <div>existing content</div>
                        |   </jay:header>
                        | </body>`,
                    `<script type="application/jay-headfull"
                        |   src="./header/header"
                        |   contract="./header/header.jay-contract"
                        |   names="header"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            // No error — existing content is preserved (e.g., from pre-rendering)
            expect(jayFile.validations).toEqual([]);
            // The existing content should be preserved, not replaced
            const jayTag = jayFile.val.body
                .querySelectorAll('*')
                .find((el) => el.tagName?.toLowerCase() === 'jay:header');
            expect(jayTag.innerHTML).toMatch(/existing content/);
        });

        it('should extract CSS from headfull FS component jay-html', async () => {
            const jayHtmlWithCss = `<html>
<head>
    <script type="application/jay-data">
        data:
            logoUrl: string
    </script>
    <style>.header { color: red; }</style>
</head>
<body>
    <header class="header">{logoUrl}</header>
</body>
</html>`;

            const resolver = makeHeadfullFSResolver({
                readJayHtml() {
                    return jayHtmlWithCss;
                },
            });

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body><jay:header /></body>`,
                    `<script type="application/jay-headfull"
                        |   src="./header/header"
                        |   contract="./header/header.jay-contract"
                        |   names="header"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.css).toEqual('.header { color: red; }');
        });

        it('should handle case-insensitive tag matching', async () => {
            const resolver = makeHeadfullFSResolver();

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body>
                        |   <jay:Header logoUrl="/logo.png" />
                        | </body>`,
                    `<script type="application/jay-headfull"
                        |   src="./header/header"
                        |   contract="./header/header.jay-contract"
                        |   names="header"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            expect(jayFile.val.headlessImports).toHaveLength(1);
            // Template should be injected despite case difference
            const jayTag = jayFile.val.body
                .querySelectorAll('*')
                .find((el) => el.tagName?.toLowerCase() === 'jay:header');
            expect(jayTag).toBeDefined();
            expect(jayTag.querySelector('header')).toBeTruthy();
        });

        it('should merge headfull FS imports with headless imports', async () => {
            const counterContract: Contract = {
                name: 'counter',
                tags: [
                    {
                        tag: 'count',
                        type: [ContractTagType.data],
                        dataType: JayNumber,
                    },
                ],
            };

            const resolver: JayImportResolver = {
                ...defaultImportResolver,
                loadContract(fullPath: string): WithValidations<Contract> {
                    if (fullPath.includes('header')) {
                        return new WithValidations(headerContract, []);
                    }
                    if (fullPath.includes('counter')) {
                        return new WithValidations(counterContract, []);
                    }
                    throw new Error(`Unexpected contract path: ${fullPath}`);
                },
                resolveLink(importingModule: string, link: string): string {
                    if (link.includes('header')) return '/components/header/header';
                    if (link.includes('counter')) return '/path/to/counter';
                    return '/resolved/' + link;
                },
                readJayHtml(importingModuleDir: string, src: string): string | null {
                    if (src.includes('header')) return headerJayHtml;
                    return null;
                },
                resolvePluginComponent(pluginName: string, contractName: string) {
                    if (pluginName === 'test-counter' && contractName === 'counter') {
                        return new WithValidations(
                            {
                                contractPath: '/path/to/counter.jay-contract',
                                componentPath: '/path/to/counter',
                                componentName: 'counter',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, ['Plugin not found']);
                },
                loadPluginContract(pluginName: string, contractName: string) {
                    if (pluginName === 'test-counter' && contractName === 'counter') {
                        return new WithValidations(
                            {
                                contract: counterContract,
                                contractPath: '/path/to/counter.jay-contract',
                            },
                            [],
                        );
                    }
                    return new WithValidations(null as any, ['Plugin not found']);
                },
            };

            const jayFile = await parseJayFile(
                jayFileWith(
                    `data:
                        |   title: string
                        |`,
                    `<body>
                        |   <jay:header logoUrl="/logo.png" />
                        |   <jay:counter />
                        | </body>`,
                    `<script type="application/jay-headfull"
                        |   src="./header/header"
                        |   contract="./header/header.jay-contract"
                        |   names="header"
                        | ></script>
                        | <script type="application/jay-headless"
                        |   plugin="test-counter"
                        |   contract="counter"
                        | ></script>`,
                ),
                'Page',
                '/pages',
                {},
                resolver,
                '',
            );

            expect(jayFile.validations).toEqual([]);
            // Both headfull FS and headless imports should be in headlessImports
            expect(jayFile.val.headlessImports).toHaveLength(2);
            const names = jayFile.val.headlessImports.map((i) => i.contractName).sort();
            expect(names).toEqual(['counter', 'header']);
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
