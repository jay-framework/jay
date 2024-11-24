import { JayImportLink } from './jay-imports';
import { SourceFileFormat } from './source-file-format';
import { JsxBlock } from '../tsx-file/jsx-block';

export interface CompilerSourceFile {
    format: SourceFileFormat;
    imports: JayImportLink[];
}

export interface JayTsxSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.JayTsx;
    baseElementName: string;
    jsxBlock: JsxBlock;
}

export interface GenericTypescriptSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.TypeScript;
}
