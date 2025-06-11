import { SourceFileFormat } from 'jay-compiler-shared';
import { JayType } from 'jay-compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from 'jay-compiler-shared';

export interface JayHtmlNamespace {
    prefix: string;
    namespace: string;
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
    headLinks: JayHtmlHeadLink[];
}
