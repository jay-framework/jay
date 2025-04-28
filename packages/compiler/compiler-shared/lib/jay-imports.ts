import { JayType } from './jay-type';

export enum JayImportKind {
    headfull,
    headless,
}

export interface JayImportName {
    name: string;
    as?: string;
    type: JayType;
}

export interface JayImportLink {
    module: string;
    names: JayImportName[];
    sandbox?: boolean;
    key?: string;
    kind: JayImportKind;
}
