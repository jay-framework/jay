import { analyzeExportedTypes } from '../lib';

import {
    JayArrayType,
    JayBoolean,
    JayComponentApiMember,
    JayComponentType,
    JayElementConstructorType,
    JayElementType,
    JayNumber,
    JayObjectType,
    JayString,
    JayUnknown,
} from 'jay-compiler-shared';

describe('typescript-compiler', () => {
    const O1 = new JayObjectType('O1', {
        s2: JayString,
        n2: JayNumber,
    });
    const A1 = new JayObjectType('A1', {
        s3: JayString,
        n3: JayNumber,
    });

    const FIXTURES = './test/fixtures';
    const TSCONFIG = FIXTURES + '/tsconfig.json';

    // todo no need to extract types from element files
    describe.skip('extract types from element files', () => {
        it('should extract types from an element file', () => {
            let types = analyzeExportedTypes(FIXTURES + '/basics/attributes/generated-element.ts', {
                relativePath: TSCONFIG,
            });

            expect(types).toEqual(
                expect.arrayContaining([
                    new JayElementConstructorType('render', 'AttributesElement'),
                    new JayElementType('AttributesElement'),
                    new JayObjectType('AttributesElementRefs', {}),
                    new JayObjectType('AttributesViewState', {
                        text: JayString,
                        text2: JayString,
                        text3: JayString,
                        bool1: JayBoolean,
                        color: JayString,
                    }),
                ]),
            );
        });

        it('should extract types from a element file, adding .ts extension automatically', () => {
            let types = analyzeExportedTypes(FIXTURES + '/basics/attributes/generated-element', {
                relativePath: TSCONFIG,
            });

            expect(types).toEqual(
                expect.arrayContaining([
                    new JayElementConstructorType('render', 'AttributesElement'),
                    new JayElementType('AttributesElement'),
                    new JayObjectType('AttributesElementRefs', {}),
                    new JayObjectType('AttributesViewState', {
                        text: JayString,
                        text2: JayString,
                        text3: JayString,
                        bool1: JayBoolean,
                        color: JayString,
                    }),
                ]),
            );
        });
    });

    // todo no need to extract types from element definition files
    describe.skip('extract types from element definition files', () => {
        it('should extract types from an element definition file', () => {
            let types = analyzeExportedTypes(FIXTURES + '/basics/data-types/generated-element', {
                relativePath: TSCONFIG,
            });

            expect(types).toEqual(
                expect.arrayContaining([
                    new JayElementConstructorType('render', 'DataTypesElement'),
                    new JayElementType('DataTypesElement'),
                    new JayObjectType('DataTypesElementRefs', {}),
                    O1,
                    A1,
                    new JayObjectType('DataTypesViewState', {
                        s1: JayString,
                        n1: JayNumber,
                        b1: JayBoolean,
                        o1: O1,
                        a1: new JayArrayType(A1),
                    }),
                ]),
            );
        });

        it('should extract types from a definition file, auto adding .d.ts', () => {
            let types = analyzeExportedTypes(FIXTURES + '/basics/data-types/generated-element', {
                relativePath: TSCONFIG,
            });

            expect(types).toEqual(
                expect.arrayContaining([
                    new JayElementConstructorType('render', 'DataTypesElement'),
                    new JayElementType('DataTypesElement'),
                    new JayObjectType('DataTypesElementRefs', {}),
                    O1,
                    A1,
                    new JayObjectType('DataTypesViewState', {
                        s1: JayString,
                        n1: JayNumber,
                        b1: JayBoolean,
                        o1: O1,
                        a1: new JayArrayType(A1),
                    }),
                ]),
            );
        });
    });

    describe('extract types from component files', () => {
        it('component using makeJayComponent', () => {
            let types = analyzeExportedTypes(FIXTURES + '/components/counter/counter', {
                relativePath: TSCONFIG,
            });

            expect(types).toEqual(
                expect.arrayContaining([
                    new JayObjectType('CounterProps', {
                        initialValue: JayNumber,
                    }),
                    new JayComponentType('Counter', [
                        new JayComponentApiMember('onChange', true),
                        new JayComponentApiMember('reset', false),
                    ]),
                ]),
            );
        });

        it('component with explicit written component constructor', () => {
            let types = analyzeExportedTypes(FIXTURES + '/components/imports/component1', {
                relativePath: TSCONFIG,
            });

            expect(types).toEqual(expect.arrayContaining([new JayComponentType('comp1', [])]));
        });

        it('component with explicit written component constructor and type', () => {
            let types = analyzeExportedTypes(
                FIXTURES + '/components/recursive-components-2/tree-node.d.ts',
                {
                    relativePath: TSCONFIG,
                },
            );

            let node = new JayObjectType('Node', {
                id: JayString,
                name: JayString,
                firstChild: undefined,
                children: undefined,
            });
            node.props.firstChild = node;
            node.props.children = new JayArrayType(node);

            expect(types).toEqual(
                expect.arrayContaining([
                    new JayObjectType('TreeNode', {}),
                    new JayComponentType('treeNode', []),
                    node,
                ]),
            );
        });

        it('recursive component', () => {
            let types = analyzeExportedTypes(
                FIXTURES + '/components/recursive-components/tree-node',
                {
                    relativePath: TSCONFIG,
                },
            );

            let nodeType = new JayObjectType('Node', {
                id: JayString,
                name: JayString,
                firstChild: JayUnknown,
                children: new JayArrayType(JayUnknown),
            });
            nodeType.props.firstChild = nodeType;
            nodeType.props.children = new JayArrayType(nodeType);

            expect(types).toEqual(
                expect.arrayContaining([new JayComponentType('TreeNode', []), nodeType]),
            );
        });
    });
});
