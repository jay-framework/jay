import { parseContract, ContractTagType } from '../../lib';
import {
    JAY_CONTRACT_EXTENSION,
    JayBoolean,
    JayEnumType,
    JayNumber,
    JayString,
    JayPromiseType,
    JayRecursiveType,
} from '@jay-framework/compiler-shared';

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

        const result = parseContract(contract, 'contract.jay-contract');
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

        const result = parseContract(contract, 'contract.jay-contract');
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

        const result = parseContract(contract, 'contract.jay-contract');
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

        const result = parseContract(contract, 'contract.jay-contract');
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'todo',
            tags: [
                {
                    tag: 'items',
                    type: [ContractTagType.subContract],
                    link: './todo-item' + JAY_CONTRACT_EXTENSION,
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

        const result = parseContract(contract, 'contract.jay-contract');
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

        const result = parseContract(contract, 'contract.jay-contract');
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
        const result = parseContract(contract, 'contract.jay-contract');
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

        const result = parseContract(contract, 'contract.jay-contract');
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

        const result = parseContract(contract, 'contract.jay-contract');
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

    it('should default to string if dataType is not specified', () => {
        const contract = `
        name: defaults
        tags:
          - tag: name
            type: data
        `;

        const result = parseContract(contract, 'contract.jay-contract');
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'defaults',
            tags: [{ tag: 'name', type: [ContractTagType.data], dataType: JayString }],
        });
    });

    it('should default to data type if type is not specified and not tags', () => {
        const contract = `
        name: defaults
        tags:
          - tag: name
            dataType: string
        `;

        const result = parseContract(contract, 'contract.jay-contract');
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'defaults',
            tags: [{ tag: 'name', type: [ContractTagType.data], dataType: JayString }],
        });
    });

    it('should default to sub-contract type if type is not specified and the tag has tags', () => {
        const contract = `
        name: defaults
        tags:
          - tag: name
            tags: 
              - tag: firstName
              - tag: lastName
        `;

        const result = parseContract(contract, 'contract.jay-contract');
        expect(result.validations).toEqual([]);
        expect(result.val).toEqual({
            name: 'defaults',
            tags: [
                {
                    tag: 'name',
                    type: [ContractTagType.subContract],
                    tags: [
                        { tag: 'firstName', type: [ContractTagType.data], dataType: JayString },
                        { tag: 'lastName', type: [ContractTagType.data], dataType: JayString },
                    ],
                },
            ],
        });
    });

    // parse variant enum

    describe('validations', () => {
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

            const result = parseContract(contract, 'contract.jay-contract');
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

            const result = parseContract(contract, 'contract.jay-contract');
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

            const result = parseContract(contract, 'contract.jay-contract');
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

            const result = parseContract(contract, 'contract.jay-contract');
            expect(result.validations).toEqual([
                'Tag [items] cannot be both sub-contract and other types',
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

            const result = parseContract(contract, 'contract.jay-contract');
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

            const result = parseContract(contract, 'contract.jay-contract');
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

            const result = parseContract(contract, 'contract.jay-contract');
            expect(result.validations).toEqual([
                'Tag [items] of type [sub-contract] must have either tags or a link',
            ]);
        });
    });

    describe('async types parsing', () => {
        it('should parse async atomic types correctly', () => {
            const contract = `
name: async-object-test
tags:
   - tag: name
     type: data
     async: true
     dataType: string
   - tag: email
     type: data
     async: true
     dataType: string
`;

            const result = parseContract(contract, 'test.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val).toEqual({
                name: 'async-object-test',
                tags: [
                    {
                        tag: 'name',
                        type: [ContractTagType.data],
                        async: true,
                        dataType: new JayPromiseType(JayString),
                    },
                    {
                        tag: 'email',
                        type: [ContractTagType.data],
                        async: true,
                        dataType: new JayPromiseType(JayString),
                    },
                ],
            });
        });

        it('should parse async object types correctly', () => {
            const contract = `
name: async-object-test
tags:
  - tag: userProfile
    type: sub-contract
    async: true
    tags:
      - tag: name
        type: data
        dataType: string
      - tag: email
        type: data
        dataType: string
`;

            const result = parseContract(contract, 'test.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val).toEqual({
                name: 'async-object-test',
                tags: [
                    {
                        tag: 'userProfile',
                        type: [ContractTagType.subContract],
                        async: true,
                        tags: [
                            { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                            { tag: 'email', type: [ContractTagType.data], dataType: JayString },
                        ],
                    },
                ],
            });
        });

        it('should parse async array types correctly', () => {
            const contract = `
name: async-array-test
tags:
  - tag: notifications
    type: sub-contract
    async: true
    repeated: true
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: message
        type: data
        dataType: string
`;

            const result = parseContract(contract, 'test.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val).toEqual({
                name: 'async-array-test',
                tags: [
                    {
                        tag: 'notifications',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        async: true,
                        tags: [
                            { tag: 'id', type: [ContractTagType.data], dataType: JayString },
                            { tag: 'message', type: [ContractTagType.data], dataType: JayString },
                        ],
                    },
                ],
            });
        });

        it('should parse nested async structures correctly', () => {
            const contract = `
name: nested-async-test
tags:
  - tag: userProfile
    type: sub-contract
    async: true
    tags:
      - tag: name
        type: data
        dataType: string
      - tag: preferences
        type: sub-contract
        async: true
        tags:
          - tag: theme
            type: data
            dataType: string
          - tag: language
            type: data
            dataType: string
`;

            const result = parseContract(contract, 'test.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val).toEqual({
                name: 'nested-async-test',
                tags: [
                    {
                        tag: 'userProfile',
                        type: [ContractTagType.subContract],
                        async: true,
                        tags: [
                            { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                            {
                                tag: 'preferences',
                                type: [ContractTagType.subContract],
                                async: true,
                                tags: [
                                    {
                                        tag: 'theme',
                                        type: [ContractTagType.data],
                                        dataType: JayString,
                                    },
                                    {
                                        tag: 'language',
                                        type: [ContractTagType.data],
                                        dataType: JayString,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });
        });
    });

    describe('recursive contracts', () => {
        it('should parse simple recursive contract with $/  ', () => {
            const contract = `
name: tree-node
tags:
  - tag: name
    type: data
    dataType: string
  - tag: id
    type: data
    dataType: string
  - tag: children
    type: sub-contract
    repeated: true
    link: $/
`;
            const result = parseContract(contract, 'tree-node.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val).toEqual({
                name: 'tree-node',
                tags: [
                    { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                    { tag: 'id', type: [ContractTagType.data], dataType: JayString },
                    {
                        tag: 'children',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        link: '$/',
                    },
                ],
            });
        });

        it('should parse binary tree with multiple recursive references', () => {
            const contract = `
name: binary-tree
tags:
  - tag: value
    type: data
    dataType: number
  - tag: id
    type: data
    dataType: string
  - tag: left
    type: sub-contract
    link: $/
  - tag: right
    type: sub-contract
    link: $/
`;
            const result = parseContract(contract, 'binary-tree.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val).toEqual({
                name: 'binary-tree',
                tags: [
                    { tag: 'value', type: [ContractTagType.data], dataType: JayNumber },
                    { tag: 'id', type: [ContractTagType.data], dataType: JayString },
                    {
                        tag: 'left',
                        type: [ContractTagType.subContract],
                        link: '$/',
                    },
                    {
                        tag: 'right',
                        type: [ContractTagType.subContract],
                        link: '$/',
                    },
                ],
            });
        });

        it('should parse indirect recursion through container', () => {
            const contract = `
name: menu-item
tags:
  - tag: label
    type: data
    dataType: string
  - tag: id
    type: data
    dataType: string
  - tag: submenu
    type: sub-contract
    tags:
      - tag: items
        type: sub-contract
        repeated: true
        link: $/
`;
            const result = parseContract(contract, 'menu-item.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val).toEqual({
                name: 'menu-item',
                tags: [
                    { tag: 'label', type: [ContractTagType.data], dataType: JayString },
                    { tag: 'id', type: [ContractTagType.data], dataType: JayString },
                    {
                        tag: 'submenu',
                        type: [ContractTagType.subContract],
                        tags: [
                            {
                                tag: 'items',
                                type: [ContractTagType.subContract],
                                repeated: true,
                                link: '$/',
                            },
                        ],
                    },
                ],
            });
        });

        it('should parse nested type reference with $/path syntax', () => {
            const contract = `
name: complex-tree
tags:
  - tag: name
    type: data
    dataType: string
  - tag: metadata
    type: sub-contract
    tags:
      - tag: category
        type: data
        dataType: string
      - tag: tags
        type: data
        dataType: string
  - tag: children
    type: sub-contract
    repeated: true
    link: $/
  - tag: relatedMetadata
    type: sub-contract
    repeated: true
    link: $/metadata
`;
            const result = parseContract(contract, 'complex-tree.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val.tags).toEqual([
                { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                {
                    tag: 'metadata',
                    type: [ContractTagType.subContract],
                    tags: [
                        { tag: 'category', type: [ContractTagType.data], dataType: JayString },
                        { tag: 'tags', type: [ContractTagType.data], dataType: JayString },
                    ],
                },
                {
                    tag: 'children',
                    type: [ContractTagType.subContract],
                    repeated: true,
                    link: '$/',
                },
                {
                    tag: 'relatedMetadata',
                    type: [ContractTagType.subContract],
                    repeated: true,
                    link: '$/metadata',
                },
            ]);
        });

        it('should allow mixing recursive and external links', () => {
            const contract = `
name: file-node
tags:
  - tag: name
    type: data
    dataType: string
  - tag: permissions
    type: sub-contract
    link: ./file-permissions${JAY_CONTRACT_EXTENSION}
  - tag: children
    type: sub-contract
    repeated: true
    link: $/
`;
            const result = parseContract(contract, 'file-node.jay-contract');
            expect(result.validations).toEqual([]);
            expect(result.val.tags).toEqual([
                { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                {
                    tag: 'permissions',
                    type: [ContractTagType.subContract],
                    link: `./file-permissions${JAY_CONTRACT_EXTENSION}`,
                },
                {
                    tag: 'children',
                    type: [ContractTagType.subContract],
                    repeated: true,
                    link: '$/',
                },
            ]);
        });
    });
});
