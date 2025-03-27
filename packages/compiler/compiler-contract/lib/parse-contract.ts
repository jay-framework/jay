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

function parseDescription(description?: string | string[]): Array<string> | undefined {
    if (!description) return undefined;
    if (Array.isArray(description)) return description;
    return [description];
}

function parseElementType(elementType?: string): Array<string> | undefined {
    if (!elementType) return undefined;
    return [elementType];
}

function parseType(type: string | string[], tagName: string): WithValidations<Array<ContractTagType>> {
    if (Array.isArray(type)) {
        return type.map(t => parseType(t, tagName))
            .reduce((acc, val) =>
                acc.merge(val, (a,b) => [...a, ...b]), new WithValidations([]));
    }
    if (type === 'data')
        return new WithValidations([ContractTagType.data])
    else if (type === 'variant')
        return new WithValidations([ContractTagType.variant]);
    else if (type === 'interactive')
        return new WithValidations([ContractTagType.interactive]);
    else
        return new WithValidations([], [`Tag [${tagName}] has an unknown tag type [${type}]`]);
}

function parseTag(tag: ParsedYamlTag, filename: string, filePath: string): WithValidations<ContractTag> {
    const types = parseType(tag.type, tag.tag);
    const validations = types.validations;

    // Validate data type tags
    if (types.val.includes(ContractTagType.data) && !tag.dataType) {
        validations.push(`Tag [${tag.tag}] of type [data] must have a dataType`);
    }

    // Validate variant type tags
    if (types.val.includes(ContractTagType.variant) && !tag.dataType) {
        validations.push(`Tag [${tag.tag}] of type [variant] must have a dataType`);
    }

    // Validate interactive type tags
    if (types.val.includes(ContractTagType.interactive) && !tag.elementType) {
        validations.push(`Tag [${tag.tag}] of type [interactive] must have an elementType`);
    }

    const dataType = parseDataType(tag.dataType);
    const description = parseDescription(tag.description);
    const elementType = parseElementType(tag.elementType);
    const required = tag.required;

    const contractTag: ContractTag = {
        tag: tag.tag,
        type: types.val,
        ...(required && { required }),
        ...(dataType && { dataType }),
        ...(description && { description }),
        ...(elementType && { elementType })
    };

    return new WithValidations<ContractTag>(contractTag, validations);
}

function parseSubContract(subContract: ParsedYamlSubContract, filename: string, filePath: string): WithValidations<SubContract> {
    const subContracts = subContract.subContracts?.map(sc => parseSubContract(sc, filename, filePath));
    const allValidations = subContracts?.flatMap(sc => sc.validations) || [];
    const parsedSubContracts = subContracts?.map(sc => sc.val)
        .filter((sc): sc is SubContract => !!sc) || [];

    const tagResults = subContract.tags.map(tag => parseTag(tag, filename, filePath));
    const tagValidations = tagResults.flatMap(tr => tr.validations);
    const parsedTags = tagResults.map(tr => tr.val)
        .filter((tag): tag is ContractTag => !!tag);

    // Check for duplicate tag names in subContract
    const tagNames = new Set<string>();
    const duplicateTagValidations: string[] = [];
    
    parsedTags.forEach(tag => {
        if (tagNames.has(tag.tag)) {
            duplicateTagValidations.push(`Duplicate tag name [${tag.tag}] in subContract [${subContract.name}]`);
        }
        tagNames.add(tag.tag);
    });

    return new WithValidations<SubContract>(
        {
            name: subContract.name,
            tags: parsedTags,
            ...(parsedSubContracts.length ? { subContracts: parsedSubContracts } : {})
        },
        [...allValidations, ...tagValidations, ...duplicateTagValidations]
    );
}

export function parseContract(
    contractYaml: string,
    filename: string,
    filePath: string,
): WithValidations<Contract> {
    try {
        const parsedYaml = yaml.load(contractYaml) as ParsedYaml;
        
        const subContracts = parsedYaml.subContracts?.map(sc => parseSubContract(sc, filename, filePath));
        const allValidations = subContracts?.flatMap(sc => sc.validations) || [];
        const parsedSubContracts = subContracts?.map(sc => sc.val).filter((sc): sc is SubContract => !!sc) || [];

        const tagResults = parsedYaml.tags.map(tag => parseTag(tag, filename, filePath));
        const tagValidations = tagResults.flatMap(tr => tr.validations);
        const parsedTags = tagResults.map(tr => tr.val).filter((tag): tag is ContractTag => !!tag);

        // Check for duplicate tag names at root level
        const tagNames = new Set<string>();
        const duplicateTagValidations: string[] = [];
        
        parsedTags.forEach(tag => {
            if (tagNames.has(tag.tag)) {
                duplicateTagValidations.push(`Duplicate tag name [${tag.tag}]`);
            }
            tagNames.add(tag.tag);
        });

        const contract: Contract = {
            name: parsedYaml.name,
            tags: parsedTags,
            ...(parsedSubContracts.length ? { subContracts: parsedSubContracts } : {})
        };

        return new WithValidations<Contract>(contract, [...allValidations, ...tagValidations, ...duplicateTagValidations]);
    }
    catch (e) {
        throw new Error(`failed to parse contract YAML ${filename} at ${filePath}, ${e.message}`)
    }
}