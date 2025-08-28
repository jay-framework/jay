import {
    WithValidations,
    JayType,
    resolvePrimitiveType,
    JayEnumType,
    JayPromiseType,
} from '@jay-framework/compiler-shared';
import { Contract, ContractTag, ContractTagType } from './contract';
import yaml from 'js-yaml';
import { parseIsEnum, parseEnumValues } from '../';
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
    async?: boolean;
}

interface ParsedYaml {
    name: string;
    tags: Array<ParsedYamlTag>;
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

function parseTag(tag: ParsedYamlTag): WithValidations<ContractTag> {
    // Default type to 'data' if not specified
    const types = parseType(tag.type || (tag.tags ? 'sub-contract' : 'data'), tag.tag);
    const typesAsString = types.val.map((_) => ContractTagType[_]).join(', ');
    const validations = types.validations;

    // Validate that subcontract type is not mixed with other types
    if (types.val.includes(ContractTagType.subContract) && types.val.length > 1) {
        validations.push(`Tag [${tag.tag}] cannot be both sub-contract and other types`);
    }

    // Default dataType to string for data tags if not specified
    let dataType = tag.dataType;
    if (types.val.includes(ContractTagType.data) && !dataType) {
        dataType = 'string';
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
    } else {
        if (tag.tags)
            validations.push(`Tag [${tag.tag}] of type [${typesAsString}] cannot have tags`);
        if (tag.link)
            validations.push(`Tag [${tag.tag}] of type [${typesAsString}] cannot have link`);
    }

    const description = parseDescription(tag.description);
    const elementType = parseElementType(tag.elementType);
    const required = tag.required;

    if (validations.length > 0) return new WithValidations(undefined, validations);

    if (types.val.includes(ContractTagType.subContract)) {
        if (tag.link) {
            return new WithValidations<ContractTag>(
                {
                    tag: tag.tag,
                    type: [ContractTagType.subContract],
                    ...(required && { required }),
                    ...(description && { description }),
                    ...(tag.repeated && { repeated: tag.repeated }),
                    link: tag.link,
                },
                validations,
            );
        }

        const subTagResults = tag.tags.map((subTag) => parseTag(subTag));
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
                ...(tag.async && { async: tag.async }),
            },
            [...validations, ...subTagValidations, ...duplicateTagValidations],
        );
    } else {
        const parsedDataType =
            tag.async === true
                ? new JayPromiseType(parseDataType(tag.tag, dataType))
                : parseDataType(tag.tag, dataType);

        // Handle regular tag
        const contractTag: ContractTag = {
            tag: tag.tag,
            type: types.val,
            ...(required && { required }),
            ...(parsedDataType && { dataType: parsedDataType }),
            ...(description && { description }),
            ...(elementType && { elementType }),
            ...(tag.async && { async: tag.async }),
        };

        return new WithValidations<ContractTag>(contractTag, validations);
    }
}

export function parseContract(contractYaml: string, fileName: string): WithValidations<Contract> {
    try {
        const parsedYaml = yaml.load(contractYaml) as ParsedYaml;

        const tagResults = parsedYaml.tags.map((tag) => parseTag(tag));
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
        throw new Error(`failed to parse contract YAML for ${fileName}, ${e.message}.`);
    }
}
