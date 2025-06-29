import { JayImportName } from '@jay-framework/compiler-shared';

export interface JayYamlStructure {
    data: any;
    imports: Record<string, Array<JayImportName>>;
    examples: any;
}
