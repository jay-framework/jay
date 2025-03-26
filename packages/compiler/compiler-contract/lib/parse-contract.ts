import {WithValidations, JayType} from "jay-compiler-shared";
import {Contract, ContractTag, ContractTagType} from "../contract";
import yaml from "js-yaml";
import {JayNumber} from "jay-compiler-shared";

interface ParsedYaml {
    name: string;
    tags: Array<{
        tag: string;
        type: string;
        required: boolean;
        dataType?: string;
        elementType?: string;
        description?: string;
    }>;
}

function parseDataType(dataType?: string): JayType | undefined {
    if (!dataType) return undefined;
    return dataType === 'number' ? JayNumber : undefined;
}

function parseDescription(description?: string): Array<string> | undefined {
    if (!description) return undefined;
    return [description];
}

function parseElementType(elementType?: string): Array<string> | undefined {
    if (!elementType) return undefined;
    return [elementType];
}

function parseType(type: string): Array<ContractTagType> {
    return [type === 'data' ? ContractTagType.data : ContractTagType.interactive];
}

export function parseContract(
    contractYaml: string,
    filename: string,
    filePath: string,
): WithValidations<Contract> {
    try {
        const parsedYaml = yaml.load(contractYaml) as ParsedYaml;

        const subContracts = undefined;
        const contract: Contract = {
            name: parsedYaml.name,
            tags: parsedYaml.tags.map((tag) => {
                const dataType = parseDataType(tag.dataType);
                const description = parseDescription(tag.description);
                const elementType = parseElementType(tag.elementType);
                const required = tag.required

                const contractTag: ContractTag = {
                    tag: tag.tag,
                    type: parseType(tag.type),
                    ...(required && { required }),
                    ...(dataType && { dataType }),
                    ...(description && { description }),
                    ...(elementType && { elementType })
                };
                return contractTag;
            }),
            ...(subContracts && { subContracts })
        };

        return new WithValidations<Contract>(contract);
    }
    catch (e) {
        throw new Error(`failed to parse contract YAML ${filename} at ${filePath}, ${e.message}`)
    }
}