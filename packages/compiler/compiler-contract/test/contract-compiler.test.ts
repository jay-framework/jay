import {LinkedContractResolver, parseContract} from "../lib";
import {compileContract} from "../lib";
import {prettify} from "jay-compiler-shared";
import {ContractTagType} from "../lib";
import {JayString, JayBoolean} from "jay-compiler-shared";

describe('compile contract', () => {

    const noHopResolver: LinkedContractResolver = {
        loadContract: (link: string) => {
            throw new Error(`Unknown link: ${link}`);
        }
    };
    it('should compile counter contract', async () => {
        const contract = `
        name: counter
        tags: 
          - tag: count
            type: data
            dataType: number
          - tag: add
            type: interactive
            elementType: HTMLButtonElement  
          - tag: subtract
            type: interactive
            elementType: HTMLButtonElement  
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract, noHopResolver);
        
        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(await prettify(`
        import { HTMLElementProxy } from 'jay-runtime';

        export interface CounterViewState {
            count: number;
        }

        export interface CounterRefs {
            add: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
            subtract: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
        }

        export interface CounterRepeatedRefs {
            add: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
            subtract: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
        }`));
    });

    it('should compile contract with sub-contract', async () => {
        const contract = `
        name: todo
        tags:
          - tag: item
            type: sub-contract
            tags:
              - tag: title
                type: data
                dataType: string
              - tag: completed
                type: data
                dataType: boolean
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract, noHopResolver);
        
        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(await prettify(`
        export interface Item {
            title: string;
            completed: boolean;
        }

        export interface TodoViewState {
            item: Item;
        }

        export interface TodoRefs {
        }

        export interface TodoRepeatedRefs {
        }`));
    });

    it('should compile contract with repeated sub-contract', async () => {
        const contract = `
        name: todo
        tags:
          - tag: items
            type: sub-contract
            repeated: true
            tags:
              - tag: title
                type: [data, interactive]
                dataType: string
                elementType: HTMLInputElement
              - tag: completed
                type: [data, interactive]
                dataType: boolean
                elementType: HTMLInputElement
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract, noHopResolver);
        
        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(await prettify(`
        import { HTMLElementCollectionProxy } from 'jay-runtime';

        export interface Items {
            title: string;
            completed: boolean;
        }

        export interface TodoViewState {
            items: Array<Items>;
        }

        export interface TodoRefs {
            title: HTMLElementCollectionProxy<Items, HTMLInputElement>;
            completed: HTMLElementCollectionProxy<Items, HTMLInputElement>;
        }

        export interface TodoRepeatedRefs {
            title: HTMLElementCollectionProxy<Items, HTMLInputElement>;
            completed: HTMLElementCollectionProxy<Items, HTMLInputElement>;
        }`));
    });

    it('should compile form contract with nested sections', async () => {
        const contract = `
        name: userForm
        tags:
          - tag: submitButton
            type: interactive
            elementType: HTMLButtonElement
          - tag: personalInfo
            type: sub-contract
            tags:
              - tag: sectionTitle
                type: data
                dataType: string
              - tag: nameFields
                type: sub-contract
                tags:
                  - tag: firstName
                    type: [data, interactive]
                    dataType: string
                    elementType: HTMLInputElement
                  - tag: lastName
                    type: [data, interactive]
                    dataType: string
                    elementType: HTMLInputElement
          - tag: contactInfo
            type: sub-contract
            tags:
              - tag: sectionTitle
                type: data
                dataType: string
              - tag: contactFields
                type: sub-contract
                tags:
                  - tag: email
                    type: [data, interactive]
                    dataType: string
                    elementType: HTMLInputElement
                  - tag: phone
                    type: [data, interactive]
                    dataType: string
                    elementType: HTMLInputElement
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract, noHopResolver);
        
        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(await prettify(`
        import { HTMLElementProxy } from 'jay-runtime';

        export interface NameFields {
            firstName: string;
            lastName: string;
        }

        export interface PersonalInfo {
            sectionTitle: string;
            nameFields: NameFields;
        }

        export interface ContactFields {
            email: string;
            phone: string;
        }

        export interface ContactInfo {
            sectionTitle: string;
            contactFields: ContactFields;
        }

        export interface UserFormViewState {
            personalInfo: PersonalInfo;
            contactInfo: ContactInfo;
        }

        export interface UserFormRefs {
            submitButton: HTMLElementProxy<UserFormViewState, HTMLButtonElement>;
            firstName: HTMLElementProxy<NameFields, HTMLInputElement>;
            lastName: HTMLElementProxy<NameFields, HTMLInputElement>;
            email: HTMLElementProxy<ContactFields, HTMLInputElement>;
            phone: HTMLElementProxy<ContactFields, HTMLInputElement>;
        }

        export interface UserFormRepeatedRefs {
            submitButton: HTMLElementCollectionProxy<UserFormViewState, HTMLButtonElement>;
            firstName: HTMLElementCollectionProxy<NameFields, HTMLInputElement>;
            lastName: HTMLElementCollectionProxy<NameFields, HTMLInputElement>;
            email: HTMLElementCollectionProxy<ContactFields, HTMLInputElement>;
            phone: HTMLElementCollectionProxy<ContactFields, HTMLInputElement>;
        }`));
    });

    it('should compile contract with variant tags', async () => {
        const contract = `
        name: todo
        tags:
          - tag: filter
            type: variant
            dataType: enum(all | active | completed)
          - tag: items
            type: sub-contract
            repeated: true
            tags:
              - tag: title
                type: data
                dataType: string
              - tag: completed
                type: data
                dataType: boolean
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract, noHopResolver);
        
        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(await prettify(`
        export enum Filter {
          all,
          active,
          completed 
        }

        export interface Items {
            title: string;
            completed: boolean;
        }

        export interface TodoViewState {
            filter: Filter;
            items: Array<Items>;
        }

        export interface TodoRefs {
        }

        export interface TodoRepeatedRefs {
        }`));
    });

    it('should compile contract with required fields', async () => {
        const contract = `
        name: counter
        tags: 
          - tag: count
            type: data
            dataType: number
            required: true
          - tag: add
            type: interactive
            elementType: HTMLButtonElement  
          - tag: subtract
            type: interactive
            elementType: HTMLButtonElement  
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract, noHopResolver);
        
        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(await prettify(`
        import { HTMLElementProxy } from 'jay-runtime';

        export interface CounterViewState {
            count: number;
        }

        export interface CounterRefs {
            add: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
            subtract: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
        }

        export interface CounterRepeatedRefs {
            add: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
            subtract: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
        }`));
    });

    it('should compile contract with multiple interactive element types', async () => {
        const contract = `
        name: choices
        tags:
          - tag: select
            type: [data, interactive]
            dataType: enum (one | two | three)
            elementType: HTMLSelectElement | HTMLInputElement
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract, noHopResolver);
        
        expect(result.validations.length).toBe(0);
        expect(await prettify(result.val)).toBe(await prettify(`
        import { HTMLElementProxy } from 'jay-runtime';

        export enum Select {
            one,
            two,
            three
        }

        export interface ChoicesViewState {
            select: Select;
        }

        export interface ChoicesRefs {
            select: HTMLElementProxy<ChoicesViewState, HTMLSelectElement | HTMLInputElement>;
        }

        export interface ChoicesRepeatedRefs {
            select: HTMLElementCollectionProxy<ChoicesViewState, HTMLSelectElement | HTMLInputElement>;
        }`));
    });

    describe('linked sub contracts', () => {

        const mockResolver: LinkedContractResolver = {
            loadContract: (link: string) => {
                if (link === './todo-item.contract.yaml') {
                    return {
                        name: 'todo-item',
                        tags: [
                            { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                            { tag: 'completed', type: [ContractTagType.data], dataType: JayBoolean },
                            { tag: 'toggleButton', type: [ContractTagType.interactive], elementType: ['HTMLButtonElement'] }
                        ]
                    };
                }
                throw new Error(`Unknown link: ${link}`);
            }
        };

        it('should compile contract with linked sub-contract', async () => {
            const contract = `
            name: todo
            tags:
              - tag: item
                type: sub-contract
                link: ./todo-item.contract.yaml
              - tag: addButton
                type: interactive
                elementType: HTMLButtonElement
            `

            const parsedContract = parseContract(contract, mockResolver);
            const result = compileContract(parsedContract, mockResolver);

            expect(result.validations).toEqual([]);
            expect(await prettify(result.val)).toBe(await prettify(`
            import { HTMLElementProxy } from 'jay-runtime';
            import { TodoItemViewState } from './todo-item';
    
            export interface TodoViewState {
                item: TodoItemViewState;
            }
    
            export interface TodoRefs {
                addButton: HTMLElementProxy<TodoViewState, HTMLButtonElement>;
                item: TodoItemRefs;
            }

            export interface TodoRepeatedRefs {
                addButton: HTMLElementCollectionProxy<TodoViewState, HTMLButtonElement>;
                item: TodoItemRepeatedRefs;
            }`));
        });

        it('should compile contract with repeated linked sub-contract', async () => {
            const contract = `
            name: todo
            tags:
              - tag: items
                type: sub-contract
                repeated: true
                link: ./todo-item.contract.yaml
              - tag: addButton
                type: interactive
                elementType: HTMLButtonElement
            `

            const parsedContract = parseContract(contract, mockResolver);
            const result = compileContract(parsedContract, mockResolver);

            expect(result.validations).toEqual([]);
            expect(await prettify(result.val)).toBe(await prettify(`
            import { HTMLElementProxy, HTMLElementCollectionProxy } from 'jay-runtime';
            import { TodoItemViewState } from './todo-item.contract';
    
            export interface TodoViewState {
                items: Array<TodoItemViewState>;
            }
    
            export interface TodoRefs {
                addButton: HTMLElementProxy<TodoViewState, HTMLButtonElement>;
                items: TodoItemRepeatedRefs;
            }

            export interface TodoRepeatedRefs {
                addButton: HTMLElementCollectionProxy<TodoViewState, HTMLButtonElement>;
                items: TodoItemRepeatedRefs;
            }`));
        });
    })
});