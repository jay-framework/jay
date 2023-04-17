import {describe, expect, it} from '@jest/globals'
import {extractTypesForFile} from "../lib/extract-types-for-file";
import {
    JayArrayType,
    JayBoolean,
    JayComponentType,
    JayElementType,
    JayNumber,
    JayObjectType,
    JayString, JayUnknown
} from "../lib/parse-jay-file";

describe('typescript-compiler', () => {

    const O1 = new JayObjectType('O1',
        {
            s2: JayString,
            n2: JayNumber
        })
    const A1 = new JayObjectType('A1',
        {
            s3: JayString,
            n3: JayNumber
        });

    it('should extract types from a file', () => {
        let types = extractTypesForFile('./test/fixtures/basics/attributes/generated.ts', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render'),
                new JayObjectType('AttributesElementRefs', {}),
                new JayObjectType('AttributesViewState',
                    {
                        text: JayString,
                        text2: JayString,
                        text3: JayString,
                        bool1: JayBoolean,
                        color: JayString
                    })
            ]))
    })

    it('should extract types from a file, adding .ts extension automatically', () => {
        let types = extractTypesForFile('./test/fixtures/basics/attributes/generated', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render'),
                new JayObjectType('AttributesElementRefs', {}),
                new JayObjectType('AttributesViewState',
                    {
                        text: JayString,
                        text2: JayString,
                        text3: JayString,
                        bool1: JayBoolean,
                        color: JayString
                    })
            ]))
    })

    it('should extract types from a definition file', () => {
        let types = extractTypesForFile('./test/fixtures/basics/data-types/generated', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render'),
                new JayObjectType('DataTypesElementRefs', {}),
                O1,
                A1,
                new JayObjectType('DataTypesViewState',
                    {
                        s1: JayString,
                        n1: JayNumber,
                        b1: JayBoolean,
                        o1: O1,
                        a1: new JayArrayType(A1)
                    }),
                new JayElementType('DataTypesElement')
            ]))
    })

    it('should extract types from a definition file, auto adding .d.ts', () => {
        let types = extractTypesForFile('./test/fixtures/basics/data-types/generated', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render'),
                new JayObjectType('DataTypesElementRefs', {}),
                O1,
                A1,
                new JayObjectType('DataTypesViewState',
                    {
                        s1: JayString,
                        n1: JayNumber,
                        b1: JayBoolean,
                        o1: O1,
                        a1: new JayArrayType(A1)
                    }),
                new JayElementType('DataTypesElement')
            ]))
    })

    it('should extract types from a recursive file', () => {
        let types = extractTypesForFile('./test/fixtures/components/recursive-components/tree-node', {relativePath: 'tsconfig-tests.json'});

        let nodeType = new JayObjectType('Node', {
            id: JayString,
            name: JayString,
            firstChild: JayUnknown,
            children: new JayArrayType(JayUnknown)
        })
        nodeType.props.firstChild = nodeType;
        nodeType.props.children = new JayArrayType(nodeType)

        let Node = types.find(_ => _.name === 'Node') as JayObjectType;
        expect(Node.name).toEqual('Node');
        expect(Node.props.id).toEqual(JayString);
        expect(Node.props.name).toEqual(JayString);
        expect(Node.props.firstChild).toEqual(nodeType);
        expect(Node.props.children).toBeInstanceOf(JayArrayType)
        expect((Node.props.children as JayArrayType).itemType).toEqual(nodeType);
        expect(types).toEqual(
            expect.arrayContaining([
                new JayComponentType('TreeNode', [])
            ]))
    })
});
