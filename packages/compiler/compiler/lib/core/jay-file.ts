import { HTMLElement } from 'node-html-parser';
import { JayImportLink } from './jay-imports';
import { JayFormat } from './jay-format';
import { JayType } from './jay-type';
import { JsxBlock } from '../tsx-file/jsx-block';
import { JayExample } from './jay-example';

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
