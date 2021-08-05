import {generateDefinitionFile, generateRuntimeFile, generateTypes} from '../lib/compiler';
import {describe, expect, it} from '@jest/globals'
import stripMargin from '@caiogondim/strip-margin'
import {JayArrayType, JayBoolean, JayDate, JayNumber, JayObjectType, JayString} from "../lib/parse-jay-file";
import {promises} from 'fs';
// import {expect} from './equal-with-compressed-whitespace';

const readFile = promises.readFile;

const readSourceFile = async (folder) => (await readFile(`./test/fixtures/${folder}/source.jay.html`)).toString().trim()
const readGeneratedFile = async (folder) => (await readFile(`./test/fixtures/${folder}/generated.ts`)).toString().trim()
const readDefinitionFile = async (folder) => (await readFile(`./test/fixtures/${folder}/generated.d.ts`)).toString().trim()

describe('compiler', () => {

    describe('generate data interfaces', () => {
        it('should generate simple interface', () => {
            let genInterface = generateTypes(new JayObjectType('ViewState', {
                name: JayString,
                age: JayNumber,
                bool: JayBoolean,
                bdate: JayDate
            }));
            expect(genInterface).toEqual(stripMargin(
                `interface ViewState {
                |  name: string,
                |  age: number,
                |  bool: boolean,
                |  bdate: Date
                |}`));
        })

        it('should generate interface with complex object types', () => {
            let genInterface = generateTypes(new JayObjectType('ViewState', {
                name: JayString,
                address: new JayObjectType('Address', {
                    street: JayString,
                })
            }));
            expect(genInterface).toEqual(stripMargin(
                `interface Address {
                |  street: string
                |}
                |
                |interface ViewState {
                |  name: string,
                |  address: Address
                |}`));
        })

        it('should generate interface with complex array of object types', () => {
            let genInterface = generateTypes(new JayObjectType('ViewState', {
                name: JayString,
                address: new JayArrayType(new JayObjectType('Address', {
                    street: JayString,
                }))
            }));
            expect(genInterface).toEqual(stripMargin(
                `interface Address {
                |  street: string
                |}
                |
                |interface ViewState {
                |  name: string,
                |  address: Array<Address>
                |}`));
        })
    })

    describe('generate the definition file', () => {
        it('should generate definition file for simple file', async () => {
            const jayFile = await readSourceFile('definition');
            let definitionFile = generateDefinitionFile(jayFile, 'definition.jay.html');
            expect(definitionFile.val).toEqual(await readDefinitionFile('definition'));
        })

        it('should generate definition file for collection file', async () => {
            const jayFile = await readSourceFile('collections');
            let definitionFile = generateDefinitionFile(jayFile, 'collections.jay.html');
            expect(definitionFile.val).toEqual(await readDefinitionFile('collections'));
        })

        it('for simple refs', async () => {
            const jayFile = await readSourceFile('counter');
            let runtimeFile = generateDefinitionFile(jayFile, 'counter.jay.html');
            expect(runtimeFile.val).toEqual(await readDefinitionFile('counter'));
        })

        it('for conditional with refs', async () => {
            const jayFile = await readSourceFile('conditions-with-refs');
            let runtimeFile = generateDefinitionFile(jayFile, 'conditions-with-refs.jay.html');
            expect(runtimeFile.val).toEqual(await readDefinitionFile('conditions-with-refs'));
        })

        it('for collection refs', async () => {
            const jayFile = await readSourceFile('collection-with-refs');
            let definitionFile = generateDefinitionFile(jayFile, 'collection-with-refs.jay.html');
            expect(definitionFile.val).toEqual(await readDefinitionFile('collection-with-refs'));
        })
    })

    describe('generate the runtime file', () => {
        it('for simple file with dynamic text', async () => {
            const jayFile = await readSourceFile('simple-dynamic-text');
            let runtimeFile = generateRuntimeFile(jayFile, 'simple-dynamic-text.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('simple-dynamic-text'));
        })

        it('for simple file with static text', async () => {
            const jayFile = await readSourceFile('simple-static-text');
            let runtimeFile = generateRuntimeFile(jayFile, 'simple-static-text.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('simple-static-text'));
        })

        it('for an empty element', async () => {
            const jayFile = await readSourceFile('empty-element');
            let runtimeFile = generateRuntimeFile(jayFile, 'empty-element.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('empty-element'));
        })

        it('for a composition of divs', async () => {
            const jayFile = await readSourceFile('composite');
            let runtimeFile = generateRuntimeFile(jayFile, 'composite.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('composite'));
        })

        it('for composition of divs 2', async () => {
            const jayFile = await readSourceFile('composite 2');
            let runtimeFile = generateRuntimeFile(jayFile, 'composite 2.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('composite 2'));
        })

        it('for conditional', async () => {
            const jayFile = await readSourceFile('conditions');
            let runtimeFile = generateRuntimeFile(jayFile, 'conditions.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('conditions'));
        })

        it('for styles', async () => {
            const jayFile = await readSourceFile('styles');
            let runtimeFile = generateRuntimeFile(jayFile, 'styles.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('styles'));
        })

        it('for collections', async () => {
            const jayFile = await readSourceFile('collections');
            let runtimeFile = generateRuntimeFile(jayFile, 'collections.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('collections'));
        })

        it('for simple refs', async () => {
            const jayFile = await readSourceFile('counter');
            let runtimeFile = generateRuntimeFile(jayFile, 'counter.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('counter'));
        })

        it('for conditional with refs', async () => {
            const jayFile = await readSourceFile('conditions-with-refs');
            let runtimeFile = generateRuntimeFile(jayFile, 'conditions-with-refs.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('conditions-with-refs'));
        })

        it('for collections with refs', async () => {
            const jayFile = await readSourceFile('collection-with-refs');
            let runtimeFile = generateRuntimeFile(jayFile, 'collection-with-refs.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('collection-with-refs'));
        })

        it('with different types of HTML element attributes', async () => {
            const jayFile = await readSourceFile('attributes');
            let runtimeFile = generateRuntimeFile(jayFile, 'attributes.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('attributes'));
        })

        it('tmp', async () => {
            const jayFile = await readSourceFile('tmp');
            let runtimeFile = generateRuntimeFile(jayFile, 'tmp.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('tmp'));
        })

        it('whitespace collapsing and handling', async () => {
            const jayFile = await readSourceFile('whitespace-and-text');
            let runtimeFile = generateRuntimeFile(jayFile, 'whitespace-and-text.jay.html');
            expect(runtimeFile.val).toEqual(await readGeneratedFile('whitespace-and-text'));
        })

    })
});

