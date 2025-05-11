import {RefsTree, SourceFileFormat} from 'jay-compiler-shared';
import { JayType } from 'jay-compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from 'jay-compiler-shared';
import {JayContractImportLink} from "../contract";

export interface JayHtmlNamespace {
    prefix: string;
    namespace: string;
}

export interface JayHeadlessImports {
    key: string,
    refs: RefsTree,
    rootType: JayType,
    importLinks: JayContractImportLink[]
}

export interface JayHtmlSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    body: HTMLElement;
    namespaces: JayHtmlNamespace[];
    headlessImports: JayHeadlessImports[]
}
