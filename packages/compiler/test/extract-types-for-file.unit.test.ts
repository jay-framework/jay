import {describe, expect, it} from '@jest/globals'
import {extractTypesForFile} from "../lib/extract-types-for-file";
import {JayArrayType, JayBoolean, JayElementType, JayNumber, JayObjectType, JayString} from "../lib/parse-jay-file";

describe('typescript-compiler', () => {

    const O1 = new JayObjectType('O1',
        {
            s2: JayString,
            n2: JayNumber
        }, true)
    const A1 = new JayObjectType('A1',
        {
            s3: JayString,
            n3: JayNumber
        }, true);

    it('should extract types from a file', () => {
        let types = extractTypesForFile('./test/fixtures/attributes/generated.ts', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render', true),
                new JayObjectType('AttributesRefs', {}, true),
                new JayObjectType('AttributesViewState',
                    {
                        text: JayString,
                        text2: JayString,
                        text3: JayString,
                        bool1: JayBoolean,
                        color: JayString
                    }, true)
            ]))
    })

    it('should extract types from a file, adding .ts extension automatically', () => {
        let types = extractTypesForFile('./test/fixtures/attributes/generated', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render', true),
                new JayObjectType('AttributesRefs', {}, true),
                new JayObjectType('AttributesViewState',
                    {
                        text: JayString,
                        text2: JayString,
                        text3: JayString,
                        bool1: JayBoolean,
                        color: JayString
                    }, true)
            ]))
    })

    it('should extract types from a definition file', () => {
        let types = extractTypesForFile('./test/fixtures/definition/generated', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render', true),
                new JayObjectType('DefinitionRefs', {}, true),
                O1,
                A1,
                new JayObjectType('DefinitionViewState',
                    {
                        s1: JayString,
                        n1: JayNumber,
                        b1: JayBoolean,
                        o1: O1,
                        a1: new JayArrayType(A1, false)
                    }, true),
                new JayElementType('DefinitionElement', true)
            ]))
    })

    it('should extract types from a definition file, auto adding .d.ts', () => {
        let types = extractTypesForFile('./test/fixtures/definition/generated', {relativePath: 'tsconfig-tests.json'});

        expect(types).toEqual(
            expect.arrayContaining([
                new JayElementType('render', true),
                new JayObjectType('DefinitionRefs', {}, true),
                O1,
                A1,
                new JayObjectType('DefinitionViewState',
                    {
                        s1: JayString,
                        n1: JayNumber,
                        b1: JayBoolean,
                        o1: O1,
                        a1: new JayArrayType(A1, false)
                    }, true),
                new JayElementType('DefinitionElement', true)
            ]))
    })
});
