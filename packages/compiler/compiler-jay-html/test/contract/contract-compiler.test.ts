import {
    parseContract,
    compileContract,
    ContractTagType,
    Contract,
    JayImportResolver,
} from '../../lib';
import {
    JAY_CONTRACT_EXTENSION,
    JayBoolean,
    JayString,
    JayType,
    prettify,
    WithValidations,
} from '@jay-framework/compiler-shared';
import path from 'path';
import { ResolveTsConfigOptions } from '@jay-framework/compiler-analyze-exported-types';

describe('compile contract', () => {
    const noHopResolver: JayImportResolver = {
        analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[] {
            throw new Error(`not implemented`);
        },
        loadContract(path: string): WithValidations<Contract> {
            throw new Error(`Unknown path: ${path}`);
        },
        resolveLink: (link: string, importingModule: string) => {
            throw new Error(`Unknown link: ${link}`);
        },
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
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
        
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
        }
        
        export type CounterContract = JayContract<CounterViewState, CounterRefs>`),
        );
    });

    it('should format tag names as camelCase', async () => {
        const contract = `
        name: counter
        tags: 
          - tag: count-one
            type: data
            dataType: number
          - tag: count two
            type: data
            dataType: number
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { JayContract } from '@jay-framework/runtime';

        export interface CounterViewState {
            countOne: number;
            countTwo: number;
        }

        export interface CounterRefs {
        }

        export interface CounterRepeatedRefs {
        }
        
        export type CounterContract = JayContract<CounterViewState, CounterRefs>`),
        );
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
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { JayContract } from '@jay-framework/runtime';
        
        export interface ItemOfTodoViewState {
            title: string;
            completed: boolean;
        }
        
        export interface TodoViewState {
            item: ItemOfTodoViewState;
        }

        export interface TodoRefs {
        }

        export interface TodoRepeatedRefs {
        }
        
        export type TodoContract = JayContract<TodoViewState, TodoRefs>`),
        );
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
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { HTMLElementCollectionProxy, JayContract } from '@jay-framework/runtime';

        export interface ItemOfTodoViewState {
            title: string;
            completed: boolean;
        }
        
        export interface TodoViewState {
            items: Array<ItemOfTodoViewState>;
        }
        
        export interface TodoRefs {
            items: {
                title: HTMLElementCollectionProxy<ItemOfTodoViewState, HTMLInputElement>;
                completed: HTMLElementCollectionProxy<ItemOfTodoViewState, HTMLInputElement>;
            };
        }
        
        export interface TodoRepeatedRefs {
            items: {
                title: HTMLElementCollectionProxy<ItemOfTodoViewState, HTMLInputElement>;
                completed: HTMLElementCollectionProxy<ItemOfTodoViewState, HTMLInputElement>;
            };
        }

        export type TodoContract = JayContract<TodoViewState, TodoRefs>`),
        );
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
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

        export interface NameFieldOfPersonalInfoOfUserFormViewState {
            firstName: string;
            lastName: string;
        }
        
        export interface PersonalInfoOfUserFormViewState {
            sectionTitle: string;
            nameFields: NameFieldOfPersonalInfoOfUserFormViewState;
        }
        
        export interface ContactFieldOfContactInfoOfUserFormViewState {
            email: string;
            phone: string;
        }
        
        export interface ContactInfoOfUserFormViewState {
            sectionTitle: string;
            contactFields: ContactFieldOfContactInfoOfUserFormViewState;
        }
        
        export interface UserFormViewState {
            personalInfo: PersonalInfoOfUserFormViewState;
            contactInfo: ContactInfoOfUserFormViewState;
        }
        
        export interface UserFormRefs {
            submitButton: HTMLElementProxy<UserFormViewState, HTMLButtonElement>;
            personalInfo: {
                nameFields: {
                    firstName: HTMLElementProxy<
                        NameFieldOfPersonalInfoOfUserFormViewState,
                        HTMLInputElement
                    >;
                    lastName: HTMLElementProxy<
                        NameFieldOfPersonalInfoOfUserFormViewState,
                        HTMLInputElement
                    >;
                };
            };
            contactInfo: {
                contactFields: {
                    email: HTMLElementProxy<ContactFieldOfContactInfoOfUserFormViewState, HTMLInputElement>;
                    phone: HTMLElementProxy<ContactFieldOfContactInfoOfUserFormViewState, HTMLInputElement>;
                };
            };
        }
        
        export interface UserFormRepeatedRefs {
            submitButton: HTMLElementCollectionProxy<UserFormViewState, HTMLButtonElement>;
            personalInfo: {
                nameFields: {
                    firstName: HTMLElementCollectionProxy<
                        NameFieldOfPersonalInfoOfUserFormViewState,
                        HTMLInputElement
                    >;
                    lastName: HTMLElementCollectionProxy<
                        NameFieldOfPersonalInfoOfUserFormViewState,
                        HTMLInputElement
                    >;
                };
            };
            contactInfo: {
                contactFields: {
                    email: HTMLElementCollectionProxy<
                        ContactFieldOfContactInfoOfUserFormViewState,
                        HTMLInputElement
                    >;
                    phone: HTMLElementCollectionProxy<
                        ContactFieldOfContactInfoOfUserFormViewState,
                        HTMLInputElement
                    >;
                };
            };
        }

        export type UserFormContract = JayContract<UserFormViewState, UserFormRefs>`),
        );
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
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { JayContract } from '@jay-framework/runtime';

        export enum Filter {
          all,
          active,
          completed 
        }

        export interface ItemOfTodoViewState {
            title: string;
            completed: boolean;
        }
        
        export interface TodoViewState {
            filter: Filter;
            items: Array<ItemOfTodoViewState>;
        }

        export interface TodoRefs {
        }

        export interface TodoRepeatedRefs {
        }

        export type TodoContract = JayContract<TodoViewState, TodoRefs>`),
        );
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
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations).toEqual([]);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

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
        }

        export type CounterContract = JayContract<CounterViewState, CounterRefs>`),
        );
    });

    it('should compile contract with multiple interactive element types', async () => {
        const contract = `
        name: choices
        tags:
          - tag: select
            type: [data, interactive]
            dataType: enum (one | two | three)
            elementType: HTMLSelectElement | HTMLInputElement
        `;

        const parsedContract = parseContract(contract, 'contract.jay-contract');
        const result = await compileContract(parsedContract, './contract', noHopResolver);

        expect(result.validations.length).toBe(0);
        expect(await prettify(result.val)).toBe(
            await prettify(`
        import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

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
        }

        export type ChoicesContract = JayContract<ChoicesViewState, ChoicesRefs>`),
        );
    });

    describe('linked sub contracts', () => {
        const mockResolver: JayImportResolver = {
            analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[] {
                throw new Error('not implemented');
            },
            loadContract(path: string): WithValidations<Contract> {
                if (path === `todo-item${JAY_CONTRACT_EXTENSION}`) {
                    return new WithValidations<Contract>({
                        name: 'todo-item',
                        tags: [
                            { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                            {
                                tag: 'completed',
                                type: [ContractTagType.data],
                                dataType: JayBoolean,
                            },
                            {
                                tag: 'toggleButton',
                                type: [ContractTagType.interactive],
                                elementType: ['HTMLButtonElement'],
                            },
                        ],
                    });
                }
                throw new Error(`Unknown link: ${path}`);
            },
            resolveLink: (importingModule: string, link: string) => {
                return path.relative(importingModule, link);
            },
        };

        it('should compile contract with linked sub-contract', async () => {
            const contract = `
            name: todo
            tags:
              - tag: item
                type: sub-contract
                link: ./todo-item${JAY_CONTRACT_EXTENSION}
              - tag: addButton
                type: interactive
                elementType: HTMLButtonElement
            `;

            const parsedContract = parseContract(contract, 'contract.jay-contract');
            const result = await compileContract(parsedContract, './contract', mockResolver);

            expect(result.validations).toEqual([]);
            expect(await prettify(result.val)).toBe(
                await prettify(`
            import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
            import { TodoItemViewState, TodoItemRefs, TodoItemRepeatedRefs } from './todo-item.jay-contract';
        
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
            }

            export type TodoContract = JayContract<TodoViewState, TodoRefs>`),
            );
        });

        it('should compile contract with repeated linked sub-contract', async () => {
            const contract = `
            name: todo
            tags:
              - tag: items
                type: sub-contract
                repeated: true
                link: ./todo-item${JAY_CONTRACT_EXTENSION}
              - tag: addButton
                type: interactive
                elementType: HTMLButtonElement
            `;

            const parsedContract = parseContract(contract, 'contract.jay-contract');
            const result = await compileContract(parsedContract, './contract', mockResolver);

            expect(result.validations).toEqual([]);
            expect(await prettify(result.val)).toBe(
                await prettify(`
            import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
            import { TodoItemViewState, TodoItemRefs, TodoItemRepeatedRefs } from './todo-item.jay-contract';
    
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
            }

            export type TodoContract = JayContract<TodoViewState, TodoRefs>`),
            );
        });

        it('should compile contract with both repeated and non-repeated instances of the same linked sub-contract', async () => {
            const contract = `
            name: todo
            tags:
              - tag: activeItem
                type: sub-contract
                link: ./todo-item${JAY_CONTRACT_EXTENSION}
              - tag: completedItems
                type: sub-contract
                repeated: true
                link: ./todo-item${JAY_CONTRACT_EXTENSION}
              - tag: addButton
                type: interactive
                elementType: HTMLButtonElement
            `;

            const parsedContract = parseContract(contract, 'contract.jay-contract');
            const result = await compileContract(parsedContract, './contract', mockResolver);

            expect(result.validations).toEqual([]);
            expect(await prettify(result.val)).toBe(
                await prettify(`
            import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
            import { TodoItemViewState, TodoItemRefs, TodoItemRepeatedRefs } from './todo-item.jay-contract';
    
            export interface TodoViewState {
                activeItem: TodoItemViewState;
                completedItems: Array<TodoItemViewState>;
            }
    
            export interface TodoRefs {
                addButton: HTMLElementProxy<TodoViewState, HTMLButtonElement>;
                activeItem: TodoItemRefs;
                completedItems: TodoItemRepeatedRefs;
            }

            export interface TodoRepeatedRefs {
                addButton: HTMLElementCollectionProxy<TodoViewState, HTMLButtonElement>;
                activeItem: TodoItemRepeatedRefs;
                completedItems: TodoItemRepeatedRefs;
            }

            export type TodoContract = JayContract<TodoViewState, TodoRefs>`),
            );
        });
    });
});
