import { JayImportName } from './jay-imports';

export interface JayYamlStructure {
    data: any;
    imports: Record<string, Array<JayImportName>>;
    examples: any;
}
