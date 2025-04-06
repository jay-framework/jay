import { WithValidations, JayType, resolvePrimitiveType, JayEnumType } from 'jay-compiler-shared';
import { Contract, ContractTag, ContractTagType } from './contract';
import yaml from 'js-yaml';
import { parseIsEnum, parseEnumValues } from 'jay-compiler-jay-html';
import { pascalCase } from 'change-case';

interface ParsedYamlTag {
    tag: string;
    type: string | string[];
    required: boolean;
    dataType?: string;
    elementType?: string;
    description?: string;
    tags?: Array<ParsedYamlTag>;
    repeated?: boolean;
    link?: string;
}

interface ParsedYaml {
    name: string;
    tags: Array<ParsedYamlTag>;
}

export interface LinkedContractResolver {
    loadContract(link: string): Contract;
}

function parseDataType(tag: string, dataType: string): JayType | undefined {
    if (!dataType) return undefined;
    if (parseIsEnum(dataType)) {
        return new JayEnumType(pascalCase(tag), parseEnumValues(dataType));
    }
    return resolvePrimitiveType(dataType);
}

function parseDescription(description?: string | string[]): Array<string> | undefined {
    if (!description) return undefined;
    if (Array.isArray(description)) return description;
    return [description];
}

function parseElementType(elementType?: string): Array<string> | undefined {
    if (!elementType) return undefined;
    return elementType.split('|').map((type) => type.trim());
}

function parseType(
    type: string | string[],
    tagName: string,
): WithValidations<Array<ContractTagType>> {
    if (Array.isArray(type)) {
        return type
            .map((t) => parseType(t, tagName))
            .reduce((acc, val) => acc.merge(val, (a, b) => [...a, ...b]), new WithValidations([]));
    }
    if (type === 'data') return new WithValidations([ContractTagType.data]);
    else if (type === 'variant') return new WithValidations([ContractTagType.variant]);
    else if (type === 'interactive') return new WithValidations([ContractTagType.interactive]);
    else if (type === 'sub-contract') return new WithValidations([ContractTagType.subContract]);
    else return new WithValidations([], [`Tag [${tagName}] has an unknown tag type [${type}]`]);
}

function parseTag(
    tag: ParsedYamlTag,
    linkedContractResolver?: LinkedContractResolver,
): WithValidations<ContractTag> {
    const types = parseType(tag.type, tag.tag);
    const validations = types.validations;

    // Validate that subcontract type is not mixed with other types
    if (types.val.includes(ContractTagType.subContract) && types.val.length > 1) {
        validations.push(`Tag [${tag.tag}] cannot be both sub-contract and other types`);
    }

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

    // Validate subcontract type tags
    if (types.val.includes(ContractTagType.subContract)) {
        if (!tag.tags && !tag.link) {
            validations.push(
                `Tag [${tag.tag}] of type [sub-contract] must have either tags or a link`,
            );
        }
        if (tag.dataType) {
            validations.push(`Tag [${tag.tag}] of type [sub-contract] cannot have a dataType`);
        }
        if (tag.elementType) {
            validations.push(`Tag [${tag.tag}] of type [sub-contract] cannot have an elementType`);
        }
    }

    const dataType = parseDataType(tag.tag, tag.dataType);
    const description = parseDescription(tag.description);
    const elementType = parseElementType(tag.elementType);
    const required = tag.required;

    // Handle linked subcontract
    if (tag.link) {
        const tags: ContractTag[] = linkedContractResolver
            ? linkedContractResolver.loadContract(tag.link).tags
            : undefined;

        return new WithValidations<ContractTag>(
            {
                tag: tag.tag,
                type: [ContractTagType.subContract],
                ...(required && { required }),
                ...(description && { description }),
                ...(tags && { tags }),
                ...(tag.repeated && { repeated: tag.repeated }),
                link: tag.link,
            },
            validations,
        );
    }

    // Handle inline subcontract
    if (tag.tags) {
        const subTagResults = tag.tags.map((subTag) => parseTag(subTag, linkedContractResolver));
        const subTagValidations = subTagResults.flatMap((tr) => tr.validations);
        const parsedSubTags = subTagResults
            .map((tr) => tr.val)
            .filter((tag): tag is ContractTag => !!tag);

        // Check for duplicate tag names in subcontract
        const tagNames = new Set<string>();
        const duplicateTagValidations: string[] = [];

        parsedSubTags.forEach((subTag) => {
            if (tagNames.has(subTag.tag)) {
                duplicateTagValidations.push(
                    `Duplicate tag name [${subTag.tag}] in sub-contract [${tag.tag}]`,
                );
            }
            tagNames.add(subTag.tag);
        });

        return new WithValidations<ContractTag>(
            {
                tag: tag.tag,
                type: [ContractTagType.subContract],
                ...(required && { required }),
                ...(description && { description }),
                tags: parsedSubTags,
                ...(tag.repeated && { repeated: tag.repeated }),
            },
            [...validations, ...subTagValidations, ...duplicateTagValidations],
        );
    }

    // Handle regular tag
    const contractTag: ContractTag = {
        tag: tag.tag,
        type: types.val,
        ...(required && { required }),
        ...(dataType && { dataType }),
        ...(description && { description }),
        ...(elementType && { elementType }),
    };

    return new WithValidations<ContractTag>(contractTag, validations);
}

export function parseContract(
    contractYaml: string,
    linkedContractResolver?: LinkedContractResolver,
): WithValidations<Contract> {
    try {
        const parsedYaml = yaml.load(contractYaml) as ParsedYaml;

        const tagResults = parsedYaml.tags.map((tag) => parseTag(tag, linkedContractResolver));
        const tagValidations = tagResults.flatMap((tr) => tr.validations);
        const parsedTags = tagResults
            .map((tr) => tr.val)
            .filter((tag): tag is ContractTag => !!tag);

        // Check for duplicate tag names at root level
        const tagNames = new Set<string>();
        const duplicateTagValidations: string[] = [];

        parsedTags.forEach((tag) => {
            if (tagNames.has(tag.tag)) {
                duplicateTagValidations.push(`Duplicate tag name [${tag.tag}]`);
            }
            tagNames.add(tag.tag);
        });

        // Check if contract has a name
        const nameValidations: string[] = [];
        if (!parsedYaml.name) {
            nameValidations.push('Contract must have a name');
        }

        const contract: Contract = {
            name: parsedYaml.name,
            tags: parsedTags,
        };

        return new WithValidations<Contract>(contract, [
            ...tagValidations,
            ...duplicateTagValidations,
            ...nameValidations,
        ]);
    } catch (e) {
        throw new Error(`failed to parse contract YAML, ${e.message}.`);
    }
}
