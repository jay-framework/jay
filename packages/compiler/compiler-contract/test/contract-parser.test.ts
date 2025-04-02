import { LinkedContractResolver, parseContract } from '../lib';
import { ContractTagType } from '../lib';
import {JAY_CONTRACT_EXTENSION, JayBoolean, JayEnumType, JayNumber, JayString} from 'jay-compiler-shared';

describe('parse contract', () => {
    it('should parse counter contract', () => {
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

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'counter',
            tags: [
                { tag: 'count', type: [ContractTagType.data], dataType: JayNumber },
                {
                    tag: 'add',
                    type: [ContractTagType.interactive],
                    elementType: ['HTMLButtonElement'],
                },
                {
                    tag: 'subtract',
                    type: [ContractTagType.interactive],
                    elementType: ['HTMLButtonElement'],
                },
            ],
        });
    });

    it('should parse enum types', () => {
        const contract = `
        name: counter
        tags: 
          - tag: variant
            type: variant
            dataType: enum (one | two | three)
        `;

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'counter',
            tags: [
                {
                    tag: 'variant',
                    type: [ContractTagType.variant],
                    dataType: new JayEnumType('Variant', ['one', 'two', 'three']),
                },
            ],
        });
    });

    it('should parse contract with sub-contract', () => {
        const contract = `
        name: todo
        tags:
          - tag: items
            type: sub-contract
            tags:
              - tag: title
                type: data
                dataType: string
              - tag: completed
                type: data
                dataType: boolean
        `;

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'todo',
            tags: [
                {
                    tag: 'items',
                    type: [ContractTagType.subContract],
                    tags: [
                        { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                        { tag: 'completed', type: [ContractTagType.data], dataType: JayBoolean },
                    ],
                },
            ],
        });
    });

    it('should parse contract with linked sub-contract', () => {
        const contract = `
        name: todo
        tags:
          - tag: items
            type: sub-contract
            link: ./todo-item${JAY_CONTRACT_EXTENSION}
        `;

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'todo',
            tags: [
                {
                    tag: 'items',
                    type: [ContractTagType.subContract],
                    link: './todo-item'+JAY_CONTRACT_EXTENSION,
                },
            ],
        });
    });

    it('should parse contract with linked sub-contract, loading the sub contract with provided LinkedContractResolver', () => {
        const contract = `
        name: todo
        tags:
          - tag: items
            type: sub-contract
            link: ./todo-item${JAY_CONTRACT_EXTENSION}
        `;

        const mockResolver: LinkedContractResolver = {
            loadContract: (link: string) => {
                if (link === `./todo-item${JAY_CONTRACT_EXTENSION}`)
                    return {
                        name: 'todo-item',
                        tags: [
                            { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                            { tag: 'completed', type: [ContractTagType.data], dataType: JayNumber },
                        ],
                    };
            },
        };

        const result = parseContract(contract, mockResolver);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'todo',
            tags: [
                {
                    tag: 'items',
                    type: [ContractTagType.subContract],
                    link: './todo-item'+JAY_CONTRACT_EXTENSION,
                    tags: [
                        { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                        { tag: 'completed', type: [ContractTagType.data], dataType: JayNumber },
                    ],
                },
            ],
        });
    });

    it('should parse contract with repeated sub-contract', () => {
        const contract = `
        name: todo
        tags:
          - tag: items
            type: sub-contract
            repeated: true
            tags:
              - tag: title
                type: data
                dataType: string
              - tag: completed
                type: data
                dataType: number
        `;

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'todo',
            tags: [
                {
                    tag: 'items',
                    type: [ContractTagType.subContract],
                    repeated: true,
                    tags: [
                        { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                        { tag: 'completed', type: [ContractTagType.data], dataType: JayNumber },
                    ],
                },
            ],
        });
    });

    it('should parse form contract with nested sections', () => {
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

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'userForm',
            tags: [
                {
                    tag: 'submitButton',
                    type: [ContractTagType.interactive],
                    elementType: ['HTMLButtonElement'],
                },
                {
                    tag: 'personalInfo',
                    type: [ContractTagType.subContract],
                    tags: [
                        { tag: 'sectionTitle', type: [ContractTagType.data], dataType: JayString },
                        {
                            tag: 'nameFields',
                            type: [ContractTagType.subContract],
                            tags: [
                                {
                                    tag: 'firstName',
                                    type: [ContractTagType.data, ContractTagType.interactive],
                                    dataType: JayString,
                                    elementType: ['HTMLInputElement'],
                                },
                                {
                                    tag: 'lastName',
                                    type: [ContractTagType.data, ContractTagType.interactive],
                                    dataType: JayString,
                                    elementType: ['HTMLInputElement'],
                                },
                            ],
                        },
                    ],
                },
                {
                    tag: 'contactInfo',
                    type: [ContractTagType.subContract],
                    tags: [
                        { tag: 'sectionTitle', type: [ContractTagType.data], dataType: JayString },
                        {
                            tag: 'contactFields',
                            type: [ContractTagType.subContract],
                            tags: [
                                {
                                    tag: 'email',
                                    type: [ContractTagType.data, ContractTagType.interactive],
                                    dataType: JayString,
                                    elementType: ['HTMLInputElement'],
                                },
                                {
                                    tag: 'phone',
                                    type: [ContractTagType.data, ContractTagType.interactive],
                                    dataType: JayString,
                                    elementType: ['HTMLInputElement'],
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    });

    it('should parse contract with multiple interactive element types', () => {
        const contract = `
        name: choices
        tags:
          - tag: select
            type: [data, interactive]
            dataType: enum (one | two | three)
            elementType: HTMLSelectElement | HTMLInputElement
        `;
        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'choices',
            tags: [
                {
                    tag: 'select',
                    type: [ContractTagType.data, ContractTagType.interactive],
                    dataType: new JayEnumType('Select', ['one', 'two', 'three']),
                    elementType: ['HTMLSelectElement', 'HTMLInputElement'],
                },
            ],
        });
    });

    it('should parse contract with tags containing descriptions', () => {
        const contract = `
        name: profile
        tags:
          - tag: username
            type: data
            dataType: string
            description: The user's display name
          - tag: avatar
            type: [data, interactive]
            dataType: string
            elementType: HTMLImageElement
            description: 
              - The user's profile picture
              - Click to upload a new image
        `;

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'profile',
            tags: [
                {
                    tag: 'username',
                    type: [ContractTagType.data],
                    dataType: JayString,
                    description: ["The user's display name"],
                },
                {
                    tag: 'avatar',
                    type: [ContractTagType.data, ContractTagType.interactive],
                    dataType: JayString,
                    elementType: ['HTMLImageElement'],
                    description: ["The user's profile picture", 'Click to upload a new image'],
                },
            ],
        });
    });

    it('should parse required tags', () => {
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

        const result = parseContract(contract);
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'counter',
            tags: [
                { tag: 'count', required: true, type: [ContractTagType.data], dataType: JayNumber },
                {
                    tag: 'add',
                    type: [ContractTagType.interactive],
                    elementType: ['HTMLButtonElement'],
                },
                {
                    tag: 'subtract',
                    type: [ContractTagType.interactive],
                    elementType: ['HTMLButtonElement'],
                },
            ],
        });
    });

    // parse variant enum

    describe('validations', () => {
        it('should report validation error if type is data and dataType is not provided', () => {
            const contract = `
            name: invalid
            tags:
              - tag: count
                type: data
              - tag: name
                type: data
                dataType: string
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual(['Tag [count] of type [data] must have a dataType']);
        });

        it('should report validation error if type is variant and dataType is not provided', () => {
            const contract = `
            name: invalid
            tags:
              - tag: status
                type: variant
              - tag: priority
                type: variant
                dataType: string
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual([
                'Tag [status] of type [variant] must have a dataType',
            ]);
        });

        it('should report validation error if type is interactive and elementType is not provided', () => {
            const contract = `
            name: invalid
            tags:
              - tag: button
                type: interactive
              - tag: input
                type: interactive
                elementType: HTMLInputElement
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual([
                'Tag [button] of type [interactive] must have an elementType',
            ]);
        });

        it('should report validation error if the tag type an unknown type', () => {
            const contract = `
            name: invalid
            tags:
              - tag: button
                type: unknown
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual(['Tag [button] has an unknown tag type [unknown]']);
        });

        it('should report validation error if sub-contract is mixed with other types', () => {
            const contract = `
            name: invalid
            tags:
              - tag: items
                type: [sub-contract, data]
                tags:
                  - tag: title
                    type: data
                    dataType: string
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual([
                'Tag [items] cannot be both sub-contract and other types',
                'Tag [items] of type [data] must have a dataType',
            ]);
        });

        it('should report validation error if sub-contract has dataType', () => {
            const contract = `
            name: invalid
            tags:
              - tag: items
                type: sub-contract
                dataType: string
                tags:
                  - tag: title
                    type: data
                    dataType: string
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual([
                'Tag [items] of type [sub-contract] cannot have a dataType',
            ]);
        });

        it('should report validation error if sub-contract has elementType', () => {
            const contract = `
            name: invalid
            tags:
              - tag: items
                type: sub-contract
                elementType: HTMLDivElement
                tags:
                  - tag: title
                    type: data
                    dataType: string
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual([
                'Tag [items] of type [sub-contract] cannot have an elementType',
            ]);
        });

        it('should report validation error if sub-contract has no tags or link', () => {
            const contract = `
            name: invalid
            tags:
              - tag: items
                type: sub-contract
            `;

            const result = parseContract(contract);
            expect(result.validations).toEqual([
                'Tag [items] of type [sub-contract] must have either tags or a link',
            ]);
        });
    });
});
