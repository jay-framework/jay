import { JayImportLink, RefsTree, SourceFileFormat } from '@jay-framework/compiler-shared';
import { JayType } from '@jay-framework/compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from '@jay-framework/compiler-shared';

export interface JayHtmlNamespace {
    prefix: string;
    namespace: string;
}

export interface JayHeadlessImports {
    key: string;
    refs: RefsTree;
    rootType: JayType;
    contractLinks: JayImportLink[];
    codeLink: JayImportLink;
}

export interface JayHtmlHeadLink {
    rel: string;
    href: string;
    attributes: Record<string, string>;
}

export interface JayHtmlSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    body: HTMLElement;
    namespaces: JayHtmlNamespace[];
    headlessImports: JayHeadlessImports[];
    headLinks: JayHtmlHeadLink[];
}
