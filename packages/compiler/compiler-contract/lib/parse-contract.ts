import {WithValidations, JayType} from "jay-compiler-shared";
import {Contract, ContractTag, ContractTagType, SubContract} from "../contract";
import yaml from "js-yaml";
import {JayNumber, JayString} from "jay-compiler-shared";

interface ParsedYamlTag {
    tag: string;
    type: string | string[];
    required: boolean;
    dataType?: string;
    elementType?: string;
    description?: string;
}

interface ParsedYamlSubContract {
    name: string;
    tags: Array<ParsedYamlTag>;
    subContracts?: Array<ParsedYamlSubContract>;
}

interface ParsedYaml {
    name: string;
    tags: Array<ParsedYamlTag>;
    subContracts?: Array<ParsedYamlSubContract>;
}

function parseDataType(dataType?: string): JayType | undefined {
    if (!dataType) return undefined;
    if (dataType === 'number') return JayNumber;
    if (dataType === 'string') return JayString;
    return undefined;
}

function parseDescription(description?: string): Array<string> | undefined {
    if (!description) return undefined;
    return [description];
}

function parseElementType(elementType?: string): Array<string> | undefined {
    if (!elementType) return undefined;
    return [elementType];
}

function parseType(type: string | string[]): Array<ContractTagType> {
    if (Array.isArray(type)) {
        return type.map(t => t === 'data' ? ContractTagType.data : ContractTagType.interactive);
    }
    return [type === 'data' ? ContractTagType.data : ContractTagType.interactive];
}

function parseSubContract(subContract: ParsedYamlSubContract): SubContract {
    return {
        name: subContract.name,
        tags: subContract.tags.map((tag) => {
            const dataType = parseDataType(tag.dataType);
            const description = parseDescription(tag.description);
            const elementType = parseElementType(tag.elementType);
            const required = tag.required;

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
        subContracts: subContract.subContracts?.map(parseSubContract) || []
    };
}

export function parseContract(
    contractYaml: string,
    filename: string,
    filePath: string,
): WithValidations<Contract> {
    try {
        const parsedYaml = yaml.load(contractYaml) as ParsedYaml;

        const subContracts = parsedYaml.subContracts?.map(parseSubContract);
        const contract: Contract = {
            name: parsedYaml.name,
            tags: parsedYaml.tags.map((tag) => {
                const dataType = parseDataType(tag.dataType);
                const description = parseDescription(tag.description);
                const elementType = parseElementType(tag.elementType);
                const required = tag.required;

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