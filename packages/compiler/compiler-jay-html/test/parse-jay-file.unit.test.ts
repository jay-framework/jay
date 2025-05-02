import { parseJayFile } from '../lib';
import {
    JayArrayType,
    JayBoolean,
    JayEnumType,
    JayImportKind,
    JayNumber,
    JayObjectType,
    JayString,
    JayTypeKind,
} from 'jay-compiler-shared';
import { stripMargin } from './test-utils/strip-margin';

describe('compiler', () => {
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
        it('should parse simple string type with no examples', () => {
            let jayFile = parseJayFile(
                jayFileWith(
                    `data:
                        |   text: string
                        |`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', { text: JayString }),
            );
        });

        it('should append the base name to the view state type', () => {
            let jayFile = parseJayFile(
                jayFileWith(
                    `data:
                        |   text: string
                        |`,
                    '<body></body>',
                ),
                'BaseElementName',
                '',
                {},
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseElementNameViewState', { text: JayString }),
            );
        });

        it('should parse invalid type', () => {
            let jayFile = parseJayFile(
                jayFileWith(
                    ` data:
                        |   text: bla`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
            );

            expect(jayFile.validations).toEqual(['invalid type [bla] found at [data.text]']);
        });

        it('should parse complex types', () => {
            let jayFile = parseJayFile(
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

        it('should parse enum types', () => {
            let jayFile = parseJayFile(
                jayFileWith(
                    ` data:
                        |   an_enum: enum(one | two | three)`,
                    '<body></body>',
                ),
                'Base',
                '',
                {},
            );

            expect(jayFile.val.types).toEqual(
                new JayObjectType('BaseViewState', {
                    an_enum: new JayEnumType('AnEnumOfBaseViewState', ['one', 'two', 'three']),
                }),
            );
        });

        it('should parse import scripts', () => {
            let jayFile = parseJayFile(
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
                        kind: JayImportKind.headfull,
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
                        kind: JayImportKind.headfull,
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
                        kind: JayImportKind.headfull,
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
                        kind: JayImportKind.headfull,
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
                        kind: JayImportKind.headfull,
                    },
                ]),
            );
        });

        it('should parse namespaces types', () => {
            let jayFile = parseJayFile(
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
            );

            expect(jayFile.val.namespaces).toEqual([
                { prefix: 'svg', namespace: 'http://www.w3.org/2000/svg' },
            ]);
        });

        it('should report on a file with two jay-data scripts', () => {
            let jayFile = parseJayFile(
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
            );
            expect(jayFile.validations).toEqual([
                'jay file should have exactly one jay-data script, found 2',
            ]);
        });

        it('should report on a file without jay-data script', () => {
            let jayFile = parseJayFile(
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
            );
            expect(jayFile.validations).toEqual([
                'jay file should have exactly one jay-data script, found none',
            ]);
        });

        it('should report on a non html file', () => {
            let jayFile = parseJayFile(`rrgargaergargaerg aergaegaraer aer erager`, 'Base', '', {});
            expect(jayFile.validations).toEqual([
                'jay file should have exactly one jay-data script, found none',
            ]);
        });

        it('should report on a file without a body', () => {
            let jayFile = parseJayFile(
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
            );
            expect(jayFile.validations).toEqual(['jay file must have exactly a body tag']);
        });

        it('should report on import missing names property', () => {
            let jayFile = parseJayFile(
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
            );

            expect(jayFile.validations.length).toEqual(1);
            expect(jayFile.validations[0]).toMatch(
                "failed to parse import names for module module - failed to parse expression [undefined]. Cannot read properties of undefined (reading 'charAt')",
            );
        });

        it('should report on import empty names property', () => {
            let jayFile = parseJayFile(
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
            );

            expect(jayFile.validations.length).toEqual(1);
            expect(jayFile.validations[0]).toMatch(
                'failed to parse import names for module module - failed to parse expression []. Expected identifier but end of input found.',
            );
        });

        it('should report on import file not found', () => {
            let jayFile = parseJayFile(
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
            );

            expect(jayFile.validations[0]).toContain(
                'failed to parse import names for module ./module - File not found.',
            );
        });
    });
});
