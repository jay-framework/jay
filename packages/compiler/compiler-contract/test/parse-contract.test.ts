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
                        {tag: 'image', type: [ContractTagType.data, ContractTagType.interactive], dataType: JayString, elementType: ["HTMLImageElement"]},
                    ],
                    subContracts: []
                }
            ]
        })
    })
});
