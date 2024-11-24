import { SourceFileFormat } from '../shared/source-file-format';
import { JayType } from '../shared/jay-type';
import { JayExample } from './jay-example';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from '../shared/compiler-source-file';

export interface JayHtmlSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    examples: Array<JayExample>;
    body: HTMLElement;
}
