import { JayImportLink, RefsTree, SourceFileFormat } from '@jay-framework/compiler-shared';
import { JayType } from '@jay-framework/compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from '@jay-framework/compiler-shared';
import { Contract } from '../contract';

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
    contract?: Contract; // The loaded contract for this headless component
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
    css?: string;
    filename?: string;
    contract?: Contract; // The parsed contract if using contract reference
    contractRef?: string; // Path to contract file if using contract reference
    hasInlineData?: boolean; // True if using inline data structure
    trackByMap?: Record<string, string>; // Map from array property path to trackBy field name for deep merge
}
