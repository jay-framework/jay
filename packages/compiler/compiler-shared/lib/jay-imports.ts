import { JayType } from './jay-type';

export interface JayImportName {
    name: string;
    as?: string;
    type: JayType;
}

export interface JayImportLink {
    module: string;
    names: JayImportName[];
    sandbox?: boolean;
}
