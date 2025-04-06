import { JayType } from 'jay-compiler-shared';

export enum ContractTagType {
    data,
    interactive,
    variant,
    subContract,
}

export interface ContractTag {
    tag: string;
    required?: boolean;
    type: Array<ContractTagType>;
    dataType?: JayType;
    elementType?: Array<string>;
    description?: Array<string>;
    tags?: Array<ContractTag>;
    repeated?: boolean;
    link?: string;
}

export interface Contract {
    name: string;
    tags: Array<ContractTag>;
}
