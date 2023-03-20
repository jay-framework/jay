import {generateDefinitionFile, generateRefsFile, generateRuntimeFile, generateTypes} from '../lib';
import {describe, expect, it} from '@jest/globals'
import stripMargin from '@caiogondim/strip-margin'
import {JayArrayType, JayBoolean, JayDate, JayNumber, JayObjectType, JayString} from "../lib/parse-jay-file";
import {promises} from 'fs';

const readFile = promises.readFile;

const readTestFile = async (folder, filename) => (await readFile(`./test/fixtures/${folder}/${filename}`)).toString().trim()
const readSourceJayFile = async (folder) => (await readFile(`./test/fixtures/${folder}/source.jay.html`)).toString().trim()
const readNamedSourceJayFile = async (folder, file) => (await readFile(`./test/fixtures/${folder}/${file}.jay.html`)).toString().trim()
const readGeneratedFile = async (folder) => (await readFile(`./test/fixtures/${folder}/generated.ts`)).toString().trim()
const readDefinitionFile = async (folder) => (await readFile(`./test/fixtures/${folder}/generated.d.ts`)).toString().trim()

describe('compiler', () => {

    describe('generate data interfaces', () => {
        it('should generate simple interface', () => {
            let genInterface = generateTypes(new JayObjectType('ElementNameViewState', {
                name: JayString,
                age: JayNumber,
                bool: JayBoolean,
                bdate: JayDate
            }));
            expect(genInterface).toEqual(stripMargin(
                `export interface ElementNameViewState {
                |  name: string,
                |  age: number,
                |  bool: boolean,
                |  bdate: Date
                |}`));
        })

        it('should generate interface with complex object types', () => {
            let genInterface = generateTypes(new JayObjectType('ElementNameViewState', {
                name: JayString,
                address: new JayObjectType('Address', {
                    street: JayString,
                })
            }));
            expect(genInterface).toEqual(stripMargin(
                `export interface Address {
                |  street: string
                |}
                |
                |export interface ElementNameViewState {
                |  name: string,
                |  address: Address
                |}`));
        })

        it('should generate interface with complex array of object types', () => {
            let genInterface = generateTypes(new JayObjectType('ElementNameViewState', {
                name: JayString,
                address: new JayArrayType(new JayObjectType('Address', {
                    street: JayString,
                }))
            }));
            expect(genInterface).toEqual(stripMargin(
                `export interface Address {
                |  street: string
                |}
                |
                |export interface ElementNameViewState {
                |  name: string,
                |  address: Array<Address>
                |}`));
        })
    })

    describe('generate the definition file', () => {
        it('should generate definition file for simple file', async () => {
            const jayFile = await readSourceJayFile('basics/data-types');
            let definitionFile = generateDefinitionFile(jayFile, 'data-types.jay.html', './test/');
            expect(definitionFile.validations).toEqual([]);
            expect(definitionFile.val).toEqual(await readDefinitionFile('basics/data-types'));
        })

        it('should generate definition file for collection file', async () => {
            const jayFile = await readSourceJayFile('collections/collections');
            let definitionFile = generateDefinitionFile(jayFile, 'collections.jay.html', './test/');
            expect(definitionFile.validations).toEqual([]);
            expect(definitionFile.val).toEqual(await readDefinitionFile('collections/collections'));
        })

        it('for simple refs', async () => {
            const jayFile = await readSourceJayFile('components/counter');
            let definitionFile = generateDefinitionFile(jayFile, 'counter.jay.html', './test/');
            expect(definitionFile.validations).toEqual([]);
            expect(definitionFile.val).toEqual(await readDefinitionFile('components/counter'));
        })

        it('for conditional with refs', async () => {
            const jayFile = await readSourceJayFile('conditions/conditions-with-refs');
            let definitionFile = generateDefinitionFile(jayFile, 'conditions-with-refs.jay.html', './test/');
            expect(definitionFile.validations).toEqual([]);
            expect(definitionFile.val).toEqual(await readDefinitionFile('conditions/conditions-with-refs'));
        })

        it('for collection refs', async () => {
            const jayFile = await readSourceJayFile('collections/collection-with-refs');
            let definitionFile = generateDefinitionFile(jayFile, 'collection-with-refs.jay.html', './test/');
            expect(definitionFile.validations).toEqual([]);
            expect(definitionFile.val).toEqual(await readDefinitionFile('collections/collection-with-refs'));
        })

        it('for nesting components in other components', async () => {
            const jayFile = await readSourceJayFile('components/component-in-component');
            let runtimeFile = generateDefinitionFile(jayFile, 'component-in-component.jay.html', './test/fixtures/components/component-in-component');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readDefinitionFile('components/component-in-component'));
        }, 10000)

    })

    describe('generate the runtime file', () => {
        describe('basics', () => {

            it('for simple file with dynamic text', async () => {
                const jayFile = await readSourceJayFile('basics/simple-dynamic-text');
                let runtimeFile = generateRuntimeFile(jayFile, 'simple-dynamic-text.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/simple-dynamic-text'));
            })

            it('for simple file with static text', async () => {
                const jayFile = await readSourceJayFile('basics/simple-static-text');
                let runtimeFile = generateRuntimeFile(jayFile, 'simple-static-text.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/simple-static-text'));
            })

            it('for an empty element', async () => {
                const jayFile = await readSourceJayFile('basics/empty-element');
                let runtimeFile = generateRuntimeFile(jayFile, 'empty-element.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/empty-element'));
            })

            it('for different data types', async () => {
                const jayFile = await readSourceJayFile('basics/data-types');
                let runtimeFile = generateRuntimeFile(jayFile, 'data-types.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/data-types'));
            })

            it('for a composition of divs', async () => {
                const jayFile = await readSourceJayFile('basics/composite');
                let runtimeFile = generateRuntimeFile(jayFile, 'composite.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/composite'));
            })

            it('for composition of divs 2', async () => {
                const jayFile = await readSourceJayFile('basics/composite 2');
                let runtimeFile = generateRuntimeFile(jayFile, 'composite 2.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/composite 2'));
            })

            it('for styles', async () => {
                const jayFile = await readSourceJayFile('basics/styles');
                let runtimeFile = generateRuntimeFile(jayFile, 'styles.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/styles'));
            })

            it('with different attributes and properties', async () => {
                const jayFile = await readSourceJayFile('basics/attributes');
                let runtimeFile = generateRuntimeFile(jayFile, 'attributes.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/attributes'));
            })

            it('with different view state input types', async () => {
                const jayFile = await readSourceJayFile('basics/dynamic-text-input-types');
                let runtimeFile = generateRuntimeFile(jayFile, 'dynamic-text-input-types.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/dynamic-text-input-types'));
            })

            it('whitespace collapsing and handling', async () => {
                const jayFile = await readSourceJayFile('basics/whitespace-and-text');
                let runtimeFile = generateRuntimeFile(jayFile, 'whitespace-and-text.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('basics/whitespace-and-text'));
            })

        })

        describe('conditions', () => {

            it('for conditional', async () => {
                const jayFile = await readSourceJayFile('conditions/conditions');
                let runtimeFile = generateRuntimeFile(jayFile, 'conditions.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('conditions/conditions'));
            })

            it('for conditional with refs', async () => {
                const jayFile = await readSourceJayFile('conditions/conditions-with-refs');
                let runtimeFile = generateRuntimeFile(jayFile, 'conditions-with-refs.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('conditions/conditions-with-refs'));
            })

            it('for enums and conditions', async () => {
                const jayFile = await readSourceJayFile('conditions/conditions-with-enum');
                let runtimeFile = generateRuntimeFile(jayFile, 'conditions-with-enum.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('conditions/conditions-with-enum'));
            })
        });

        describe('collections', () => {
            it('for collections', async () => {
                const jayFile = await readSourceJayFile('collections/collections');
                let runtimeFile = generateRuntimeFile(jayFile, 'collections.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('collections/collections'));
            })

            it('for collections with refs', async () => {
                const jayFile = await readSourceJayFile('collections/collection-with-refs');
                let runtimeFile = generateRuntimeFile(jayFile, 'collection-with-refs.jay.html', './test/fixtures/collections');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('collections/collection-with-refs'));
            })
        });

        describe('components', () => {
            it('for simple refs', async () => {
                const jayFile = await readSourceJayFile('components/counter');
                let runtimeFile = generateRuntimeFile(jayFile, 'counter.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('components/counter'));
            })

            it('nesting components in other components', async () => {
                const jayFile = await readSourceJayFile('components/component-in-component');
                let runtimeFile = generateRuntimeFile(jayFile, 'component-in-component.jay.html', './test/fixtures/components/component-in-component');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('components/component-in-component'));
            }, 10000)

            it('dynamic nesting components in other components', async () => {
                const jayFile = await readSourceJayFile('components/dynamic-component-in-component');
                let runtimeFile = generateRuntimeFile(jayFile, 'dynamic-component-in-component.jay.html', './test/fixtures/components/dynamic-component-in-component');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('components/dynamic-component-in-component'));
            })

            it('recursive-components', async () => {
                const jayFile = await readSourceJayFile('components/recursive-components');
                let runtimeFile = generateRuntimeFile(jayFile, 'recursive-components.jay.html', './test/fixtures/components/recursive-components');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('components/recursive-components'));
            })

            it('recursive-components-2', async () => {
                const jayFile = await readSourceJayFile('components/recursive-components-2');
                let runtimeFile = generateRuntimeFile(jayFile, 'recursive-components-2.jay.html', './test/fixtures/components/recursive-components-2');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('components/recursive-components-2'));
            })

            it('tree', async () => {
                const jayFile = await readNamedSourceJayFile('components/tree', 'tree-node');
                let runtimeFile = generateRuntimeFile(jayFile, 'tree-node.jay.html', './test/fixtures/components/tree');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedFile('components/tree'));
            })
        });

        it.skip('tmp', async () => {
            const jayFile = await readSourceJayFile('tmp');
            let runtimeFile = generateRuntimeFile(jayFile, 'tmp.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedFile('tmp'));
        })
    })

    describe('generate the refs file', () => {
        it('should support events in refs', async () => {
            let refsFile = generateRefsFile('./test/fixtures/components/counter/counter')
            expect(refsFile.validations).toEqual([]);
            expect(refsFile.val).toEqual(await readTestFile('./components/counter', 'counter-refs.d.ts'));
        })
    })
});

