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

export interface SubContractLink {
    tag: string
    link: string
    repeated?: boolean
}
export interface SubContract {
    tag: string;
    tags: Array<ContractTag>
    repeated?: boolean;
    subContracts?: Array<SubContract | SubContractLink>
}

export interface Contract {
    name: string;
    tags: Array<ContractTag>
    subContracts?: Array<SubContract | SubContractLink>
}