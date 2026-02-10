import { JayType } from '@jay-framework/compiler-shared';

export enum ContractTagType {
    data,
    interactive,
    variant,
    subContract,
}

export type RenderingPhase = 'slow' | 'fast' | 'fast+interactive';

export interface ContractTag {
    tag: string;
    required?: boolean;
    type: Array<ContractTagType>;
    dataType?: JayType;
    elementType?: Array<string>;
    description?: Array<string>;
    tags?: Array<ContractTag>;
    repeated?: boolean;
    trackBy?: string; // Required for repeated sub-contracts - references a data tag for array item identity
    link?: string;
    async?: boolean;
    phase?: RenderingPhase;
}

export interface ContractProp {
    name: string;
    dataType: JayType;
    required?: boolean;
    description?: Array<string>;
    default?: string;
}

/** URL/load params for a page (e.g. [slug]). Always string in generated type (UrlParams = Record<string, string>). Design Log #85. */
export interface ContractParam {
    name: string;
}

export interface Contract {
    name: string;
    tags: Array<ContractTag>;
    props?: Array<ContractProp>;
    /** URL/load params (e.g. slug for [slug] route). Generates Params extends UrlParams. */
    params?: Array<ContractParam>;
}
