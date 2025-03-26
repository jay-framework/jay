import {parseContract} from "../lib/parse-contract";
import {ContractTagType} from "../contract";
import {JayNumber} from "jay-compiler-shared";

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
});
