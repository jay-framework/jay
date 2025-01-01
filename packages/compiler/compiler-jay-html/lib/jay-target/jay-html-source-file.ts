import { SourceFileFormat } from 'jay-compiler-shared';
import { JayType } from 'jay-compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from 'jay-compiler-shared';

export interface JayHtmlSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    body: HTMLElement;
}
