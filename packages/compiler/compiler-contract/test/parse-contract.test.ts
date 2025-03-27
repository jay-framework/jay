import {parseContract} from "../lib/parse-contract";
import {ContractTagType} from "../contract";
import {JayNumber, JayString} from "jay-compiler-shared";

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
        `

        const result = parseContract(contract, '', '')
        expect(result.validations.length).toBe(0)
        expect(result.val).toEqual({
            name: 'counter',
            tags: [
                {tag: 'count', type: [ContractTagType.data], dataType: JayNumber},
                {tag: 'add', type: [ContractTagType.interactive], elementType: ["HTMLButtonElement"]},
                {tag: 'subtract', type: [ContractTagType.interactive], elementType: ["HTMLButtonElement"]}
            ]
        })
    })

    it('should parse gallery contract', () => {
        const contract = `
        name: gallery
        tags:
          - tag: mainImage
            type: data
            dataType: string
          - tag: prevButton
            type: interactive
            elementType: HTMLButtonElement
          - tag: nextButton
            type: interactive
            elementType: HTMLButtonElement
        subContracts:
          - name: imageDetails
            tags:
              - tag: image
                type: [data, interactive]
                dataType: string
                elementType: HTMLImageElement
        `

        const result = parseContract(contract, '', '')
        expect(result.validations.length).toBe(0)
        expect(result.val).toEqual({
            name: 'gallery',
            tags: [
                {tag: 'mainImage', type: [ContractTagType.data], dataType: JayString},
                {tag: 'prevButton', type: [ContractTagType.interactive], elementType: ["HTMLButtonElement"]},
                {tag: 'nextButton', type: [ContractTagType.interactive], elementType: ["HTMLButtonElement"]}
            ],
            subContracts: [
                {
                    name: 'imageDetails',
                    tags: [
                        {tag: 'image', type: [ContractTagType.data, ContractTagType.interactive], dataType: JayString, elementType: ["HTMLImageElement"]}
                    ],
                }
            ]
        })
    })

    it('should parse form contract with nested sections', () => {
        const contract = `
        name: userForm
        tags:
          - tag: submitButton
            type: interactive
            elementType: HTMLButtonElement
        subContracts:
          - name: personalInfo
            tags:
              - tag: sectionTitle
                type: data
                dataType: string
            subContracts:
              - name: nameFields
                tags:
                  - tag: firstName
                    type: [data, interactive]
                    dataType: string
                    elementType: HTMLInputElement
                  - tag: lastName
                    type: [data, interactive]
                    dataType: string
                    elementType: HTMLInputElement
          - name: contactInfo
            tags:
              - tag: sectionTitle
                type: data
                dataType: string
            subContracts:
              - name: contactFields
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

        const result = parseContract(contract, '', '')
        expect(result.validations.length).toBe(0)
        expect(result.val).toEqual({
            name: 'userForm',
            tags: [
                {tag: 'submitButton', type: [ContractTagType.interactive], elementType: ["HTMLButtonElement"]}
            ],
            subContracts: [
                {
                    name: 'personalInfo',
                    tags: [
                        {tag: 'sectionTitle', type: [ContractTagType.data], dataType: JayString}
                    ],
                    subContracts: [
                        {
                            name: 'nameFields',
                            tags: [
                                {tag: 'firstName', type: [ContractTagType.data, ContractTagType.interactive], dataType: JayString, elementType: ["HTMLInputElement"]},
                                {tag: 'lastName', type: [ContractTagType.data, ContractTagType.interactive], dataType: JayString, elementType: ["HTMLInputElement"]}
                            ],
                        }
                    ]
                },
                {
                    name: 'contactInfo',
                    tags: [
                        {tag: 'sectionTitle', type: [ContractTagType.data], dataType: JayString}
                    ],
                    subContracts: [
                        {
                            name: 'contactFields',
                            tags: [
                                {tag: 'email', type: [ContractTagType.data, ContractTagType.interactive], dataType: JayString, elementType: ["HTMLInputElement"]},
                                {tag: 'phone', type: [ContractTagType.data, ContractTagType.interactive], dataType: JayString, elementType: ["HTMLInputElement"]}
                            ],
                        }
                    ]
                }
            ]
        })
    })

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
        `

        const result = parseContract(contract, '', '')
        expect(result.validations.length).toBe(0)
        expect(result.val).toEqual({
            name: 'profile',
            tags: [
                {tag: 'username', type: [ContractTagType.data], dataType: JayString, description: ["The user's display name"]},
                {
                    tag: 'avatar',
                    type: [ContractTagType.data, ContractTagType.interactive],
                    dataType: JayString,
                    elementType: ["HTMLImageElement"],
                    description: [
                        "The user's profile picture",
                        "Click to upload a new image"
                    ]
                }
            ]
        })
    })

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
        `

        const result = parseContract(contract, '', '')
        expect(result.validations.length).toBe(0)
        expect(result.val).toEqual({
            name: 'counter',
            tags: [
                {tag: 'count', required: true, type: [ContractTagType.data], dataType: JayNumber},
                {tag: 'add', type: [ContractTagType.interactive], elementType: ["HTMLButtonElement"]},
                {tag: 'subtract', type: [ContractTagType.interactive], elementType: ["HTMLButtonElement"]}
            ]
        })
    })

    // parse variant enum

    // parse complex object data tag

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
        `

            const result = parseContract(contract, 'invalid.yaml', '/path/to/invalid.yaml')
            expect(result.validations).toEqual(["Tag [count] of type [data] must have a dataType"])
        })

        it('should report validation error if type is variant and dataType is not provided', () => {
            const contract = `
            name: invalid
            tags:
              - tag: status
                type: variant
              - tag: priority
                type: variant
                dataType: string
        `

            const result = parseContract(contract, 'invalid.yaml', '/path/to/invalid.yaml')
            expect(result.validations).toEqual(["Tag [status] of type [variant] must have a dataType"])
        })

        it('should report validation error if type is interactive and elementType is not provided', () => {
            const contract = `
            name: invalid
            tags:
              - tag: button
                type: interactive
              - tag: input
                type: interactive
                elementType: HTMLInputElement
        `

            const result = parseContract(contract, 'invalid.yaml', '/path/to/invalid.yaml')
            expect(result.validations).toEqual(["Tag [button] of type [interactive] must have an elementType"])
        })

        it('should report validation error if the tag type an unknown type', () => {
            const contract = `
            name: invalid
            tags:
              - tag: button
                type: unknown
        `

            const result = parseContract(contract, 'invalid.yaml', '/path/to/invalid.yaml')
            expect(result.validations).toEqual(["Tag [button] has an unknown tag type [unknown]"])
        })

        it('should report validation error if two tags have the same name', () => {
            const contract = `
            name: invalid
            tags:
              - tag: button
                type: string
              - tag: button
                type: string
        `

            const result = parseContract(contract, 'invalid.yaml', '/path/to/invalid.yaml')
            expect(result.validations).toEqual(["Duplicate tag name [button]"])
        })

        it('should report validation error if a contract does not have a name', () => {
            const contract = `
            tags:
              - tag: button
                type: string
        `

            const result = parseContract(contract, 'invalid.yaml', '/path/to/invalid.yaml')
            expect(result.validations).toEqual(["A Contact must have a name"])
        })
    })
});
