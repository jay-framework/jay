import {parseContract} from "../lib";
import {compileContract} from "../lib";
import {prettify} from "jay-compiler-shared";

describe('compile contract', () => {
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
        const result = compileContract(parsedContract);
        
        expect(result.validations.length).toBe(0);
        expect(await prettify(result.val)).toBe(await prettify(`
        export interface CounterViewState {
            count: number;
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
        const result = compileContract(parsedContract);
        
        expect(result.validations.length).toBe(0);
        expect(await prettify(result.val)).toBe(await prettify(`
        export interface Item {
            title: string;
            completed: boolean;
        }

        export interface TodoViewState {
            item: Item;
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
                type: data
                dataType: string
              - tag: completed
                type: data
                dataType: boolean
        `

        const parsedContract = parseContract(contract);
        const result = compileContract(parsedContract);
        
        expect(result.validations.length).toBe(0);
        expect(await prettify(result.val)).toBe(await prettify(`
        export interface Items {
            title: string;
            completed: boolean;
        }

        export interface TodoViewState {
            items: Array<Items>;
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
        const result = compileContract(parsedContract);
        
        expect(result.validations.length).toBe(0);
        expect(await prettify(result.val)).toBe(await prettify(`
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
        const result = compileContract(parsedContract);
        
        expect(result.validations.length).toBe(0);
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
        const result = compileContract(parsedContract);
        
        expect(result.validations.length).toBe(0);
        expect(await prettify(result.val)).toBe(await prettify(`
        export interface CounterViewState {
            count: number;
        }`));
    });
}); 