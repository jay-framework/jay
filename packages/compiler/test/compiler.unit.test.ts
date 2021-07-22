import {generateDefinitionFile, generateRuntimeFile, generateTypes} from '../lib/compiler';
import {describe, expect, it} from '@jest/globals'
import stripMargin from '@caiogondim/strip-margin'
import {JayArrayType, JayBoolean, JayDate, JayNumber, JayObjectType, JayString} from "../lib/parse-jay-file";
import {promises} from 'fs';
import {expectE} from './equal-with-compressed-whitespace';

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
            expectE(definitionFile.val).toMatchStringIgnoringWhitespace(await readDefinitionFile('definition'));
        })

        it('should generate definition file for collection file', async () => {
            const jayFile = await readSourceFile('collections');
            let definitionFile = generateDefinitionFile(jayFile, 'collections.jay.html');
            expectE(definitionFile.val).toMatchStringIgnoringWhitespace(await readDefinitionFile('collections'));
        })

        it('for simple refs', async () => {
            const jayFile = await readSourceFile('counter');
            let runtimeFile = generateDefinitionFile(jayFile, 'counter.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readDefinitionFile('counter'));
        })

        it('for conditional with refs', async () => {
            const jayFile = await readSourceFile('conditions-with-refs');
            let runtimeFile = generateDefinitionFile(jayFile, 'conditions-with-refs.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readDefinitionFile('conditions-with-refs'));
        })

        it('for collection refs', async () => {
            const jayFile = await readSourceFile('collection-with-refs');
            let definitionFile = generateDefinitionFile(jayFile, 'collection-with-refs.jay.html');
            expectE(definitionFile.val).toMatchStringIgnoringWhitespace(await readDefinitionFile('collection-with-refs'));
        })
    })

    describe('generate the runtime file', () => {
        it('for simple file with dynamic text', async () => {
            const jayFile = await readSourceFile('simple-dynamic-text');
            let runtimeFile = generateRuntimeFile(jayFile, 'simple-dynamic-text.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('simple-dynamic-text'));
        })

        it('for simple file with static text', async () => {
            const jayFile = await readSourceFile('simple-static-text');
            let runtimeFile = generateRuntimeFile(jayFile, 'simple-static-text.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('simple-static-text'));
        })

        it('for a composition of divs', async () => {
            const jayFile = await readSourceFile('composite');
            let runtimeFile = generateRuntimeFile(jayFile, 'composite.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('composite'));
        })

        it('for composition of divs 2', async () => {
            const jayFile = await readSourceFile('composite 2');
            let runtimeFile = generateRuntimeFile(jayFile, 'composite 2.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('composite 2'));
        })

        it('for conditional', async () => {
            const jayFile = await readSourceFile('conditions');
            let runtimeFile = generateRuntimeFile(jayFile, 'conditions.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('conditions'));
        })

        it('for styles', async () => {
            const jayFile = await readSourceFile('styles');
            let runtimeFile = generateRuntimeFile(jayFile, 'styles.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('styles'));
        })

        it('for collections', async () => {
            const jayFile = await readSourceFile('collections');
            let runtimeFile = generateRuntimeFile(jayFile, 'collections.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('collections'));
        })

        it('for simple refs', async () => {
            const jayFile = await readSourceFile('counter');
            let runtimeFile = generateRuntimeFile(jayFile, 'counter.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('counter'));
        })

        it('for conditional with refs', async () => {
            const jayFile = await readSourceFile('conditions-with-refs');
            let runtimeFile = generateRuntimeFile(jayFile, 'conditions-with-refs.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('conditions-with-refs'));
        })

        it('for collections with refs', async () => {
            const jayFile = await readSourceFile('collection-with-refs');
            let runtimeFile = generateRuntimeFile(jayFile, 'collection-with-refs.jay.html');
            expectE(runtimeFile.val).toMatchStringIgnoringWhitespace(await readGeneratedFile('collection-with-refs'));
        })
    })
});

