import { JayImportName } from '@jay-framework/compiler-shared';
import { Contract } from '../contract';

export interface JayYamlStructure {
    data?: any;
    imports: Record<string, Array<JayImportName>>;
    examples: any;
    contractRef?: string; // Path to external contract file
    parsedContract?: Contract; // The parsed contract (populated after loading)
    hasInlineData?: boolean; // True if using inline data structure
}
