import { JayImportName } from '../compiler-shared/jay-imports';

export interface JayYamlStructure {
    data: any;
    imports: Record<string, Array<JayImportName>>;
    examples: any;
}
