import { JayImportLink } from './jay-imports';
import { SourceFileFormat } from './source-file-format';

export interface CompilerSourceFile {
    format: SourceFileFormat;
    imports: JayImportLink[];
}

export interface GenericTypescriptSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.TypeScript;
}
