import { HTMLElement } from 'node-html-parser';
import { JsxBlock } from '../tsx-file/jsx-block';
import { JayFormat } from './jay-format';

export interface JayType {
    name: string;
}

export class JayAtomicType implements JayType {
    constructor(public readonly name: string) {}
}

export const JayString = new JayAtomicType('string');
export const JayNumber = new JayAtomicType('number');
export const JayBoolean = new JayAtomicType('boolean');
export const JayDate = new JayAtomicType('Date');
export const JayUnknown = new JayAtomicType('Unknown');
const typesMap = {
    string: JayString,
    number: JayNumber,
    boolean: JayBoolean,
    date: JayDate,
};

export function resolvePrimitiveType(typeName: string): JayType {
    return typesMap[typeName] || JayUnknown;
}

export class JayTypeAlias implements JayType {
    constructor(public readonly name: string) {}
}

export class JayEnumType implements JayType {
    constructor(
        public readonly name: string,
        public readonly values: Array<string>,
    ) {}
}

export class JayHTMLType implements JayType {
    constructor(public readonly name: string) {}
}

export class JayImportedType implements JayType {
    constructor(
        public readonly name: string,
        public readonly type: JayType,
    ) {}
}

export class JayElementType implements JayType {
    constructor(public readonly name: string) {}
}

export class JayComponentApiMember {
    constructor(
        public readonly property: string,
        public readonly isEvent: boolean,
    ) {}
}

export class JayComponentType implements JayType {
    constructor(
        public readonly name: string,
        public readonly api: Array<JayComponentApiMember>,
    ) {}
}

export class JayObjectType implements JayType {
    constructor(
        public readonly name: string,
        public readonly props: { [key: string]: JayType },
    ) {}
}

export class JayArrayType implements JayType {
    constructor(public readonly itemType: JayType) {}

    get name() {
        return `Array<${this.itemType.name}>`;
    }
}

interface JayExample {
    name: string;
    data: any;
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
}

export interface JayHtmlFile {
    format: JayFormat.JayHtml;
    imports: JayImportLink[];
    baseElementName: string;
    types: JayType;
    examples: Array<JayExample>;
    body: HTMLElement;
}

export interface JayTsxFile {
    format: JayFormat.JayTsx;
    imports: JayImportLink[];
    baseElementName: string;
    jsxBlock: JsxBlock;
}

export interface JayTypeScriptFile {
    format: JayFormat.TypeScript;
    imports: JayImportLink[];
    baseElementName: string;
}

export type JayFile = JayHtmlFile | JayTsxFile | JayTypeScriptFile;

export interface JayYamlStructure {
    data: any;
    imports: Record<string, Array<JayImportName>>;
    examples: any;
}
