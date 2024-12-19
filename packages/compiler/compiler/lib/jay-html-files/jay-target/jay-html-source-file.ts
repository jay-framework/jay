import { SourceFileFormat } from 'jay-compiler-shared';
import { JayType } from 'jay-compiler-shared';
import { JayExample } from './jay-example';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from 'jay-compiler-shared';

export interface JayHtmlSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    examples: Array<JayExample>;
    body: HTMLElement;
}
