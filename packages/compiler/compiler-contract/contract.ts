import {JayType} from "jay-compiler-shared";

export enum ContractTagType {
    data,
    interactive,
    variant
}

export interface ContractTag {
    tag: string;
    required: boolean,
    type: Array<ContractTagType>
    dataType?: JayType
    elementType?: Array<string>
    description?: Array<string>
}

export interface SubContract {
    name: string;
    tags: Array<ContractTag>
    subContracts?: Array<SubContract>
}

export interface Contract {
    name: string;
    tags: Array<ContractTag>
    subContracts?: Array<SubContract>
}