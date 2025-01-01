import { JayImportName } from 'jay-compiler-shared';

export interface JayYamlStructure {
    data: any;
    imports: Record<string, Array<JayImportName>>;
    examples: any;
}
