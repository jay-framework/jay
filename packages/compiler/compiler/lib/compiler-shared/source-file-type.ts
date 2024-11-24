import {JayImportLink} from './jay-imports';
import {SourceFileFormat} from './source-file-format';
import {JsxBlock} from '../tsx-file/jsx-block';

export interface SourceFileType {
    format: SourceFileFormat
    imports: JayImportLink[];
}

export interface JayTsxSourceFile extends SourceFileType {
    format: SourceFileFormat.JayTsx;
    baseElementName: string;
    jsxBlock: JsxBlock;
}

export interface TypeScriptModuleSourceFile extends SourceFileType {
    format: SourceFileFormat.TypeScript;
}

