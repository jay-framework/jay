import {
    WithValidations,
    JayType,
    resolvePrimitiveType,
    JayEnumType,
    JayPromiseType,
    JayRecursiveType,
    JayArrayType,
} from '@jay-framework/compiler-shared';
import { Contract, ContractTag, ContractTagType, RenderingPhase } from './contract';
import yaml from 'js-yaml';
import { parseIsEnum, parseEnumValues } from '../';
import { pascalCase } from 'change-case';
import { validateContractPhases } from './contract-phase-validator';

interface ParsedYamlTag {
    tag: string;
    type: string | string[];
    required: boolean;
    dataType?: string;
    elementType?: string;
    description?: string;
    tags?: Array<ParsedYamlTag>;
    repeated?: boolean;
    trackBy?: string;
    link?: string;
    async?: boolean;
    phase?: string;
}

interface ParsedYaml {
    name: string;
    tags: Array<ParsedYamlTag>;
}

/**
 * Checks if a type string is a recursive reference (starts with "$/" like "$/data")
 */
function isRecursiveReference(typeString: string): boolean {
    return typeof typeString === 'string' && typeString.startsWith('$/');
}

/**
 * Parses array<$/...> syntax to extract the recursive reference
 * Returns the reference path if valid, null otherwise
 */
function parseArrayRecursiveReference(typeString: string): string | null {
    if (typeof typeString !== 'string') return null;

    const match = typeString.match(/^array<(\$\/.*)>$/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

function parseDataType(tag: string, dataType: string): JayType | undefined {
    if (!dataType) return undefined;
    if (parseIsEnum(dataType)) {
        return new JayEnumType(pascalCase(tag), parseEnumValues(dataType));
    }

    // Check for recursive references like "$/data"
    if (isRecursiveReference(dataType)) {
        return new JayRecursiveType(dataType);
    }

    // Check for array recursive references like "array<$/data>"
    const arrayRecursiveRef = parseArrayRecursiveReference(dataType);
    if (arrayRecursiveRef) {
        return new JayArrayType(new JayRecursiveType(arrayRecursiveRef));
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

function parsePhase(
    phase: string | undefined,
    tagName: string,
    tagTypes: ContractTagType[],
): WithValidations<RenderingPhase | undefined> {
    const validations: string[] = [];

    if (!phase) {
        return new WithValidations(undefined, validations);
    }

    const validPhases: RenderingPhase[] = ['slow', 'fast', 'fast+interactive'];

    if (!validPhases.includes(phase as RenderingPhase)) {
        validations.push(
            `Tag [${tagName}] has invalid phase [${phase}]. Valid phases are: ${validPhases.join(', ')}`,
        );
        return new WithValidations(undefined, validations);
    }

    // Validate that interactive tags don't have explicit phase (they're implicitly fast+interactive)
    if (tagTypes.includes(ContractTagType.interactive)) {
        validations.push(
            `Tag [${tagName}] of type [interactive] cannot have an explicit phase attribute (implicitly fast+interactive)`,
        );
        return new WithValidations(undefined, validations);
    }

    return new WithValidations(phase as RenderingPhase, validations);
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
        // Validate trackBy for repeated sub-contracts
        if (tag.repeated && !tag.trackBy) {
            validations.push(
                `Tag [${tag.tag}] is a repeated sub-contract and requires a trackBy attribute`,
            );
        }
        if (tag.trackBy && !tag.repeated) {
            validations.push(
                `Tag [${tag.tag}] has trackBy but is not marked as repeated`,
            );
        }
        // Validate that trackBy references a valid tag
        if (tag.trackBy && tag.tags) {
            const trackByTag = tag.tags.find((t) => t.tag === tag.trackBy);
            if (!trackByTag) {
                validations.push(
                    `Tag [${tag.tag}] trackBy references [${tag.trackBy}] which does not exist in the sub-contract`,
                );
            } else {
                // Validate that trackBy references a data tag
                const trackByTypes = parseType(trackByTag.type || 'data', trackByTag.tag);
                if (!trackByTypes.val.includes(ContractTagType.data)) {
                    validations.push(
                        `Tag [${tag.tag}] trackBy must reference a data tag, but [${tag.trackBy}] is not a data tag`,
                    );
                }
                // Validate that trackBy references string or number
                if (trackByTag.dataType) {
                    const trackByDataType = trackByTag.dataType.toLowerCase();
                    if (trackByDataType !== 'string' && trackByDataType !== 'number') {
                        validations.push(
                            `Tag [${tag.tag}] trackBy must reference a string or number property, but [${tag.trackBy}] is type [${trackByTag.dataType}]`,
                        );
                    }
                }
                // Warn if trackBy field has phase: fast or fast+interactive (should be slow for identity)
                if (trackByTag.phase && trackByTag.phase !== 'slow') {
                    validations.push(
                        `Tag [${tag.tag}] trackBy field [${tag.trackBy}] should have phase 'slow' (or no phase) since identity is slow-changing data. ` +
                        `Found phase: [${trackByTag.phase}]. Note: trackBy fields are automatically included in all phases for merging.`,
                    );
                }
            }
        }
    } else {
        if (tag.tags)
            validations.push(`Tag [${tag.tag}] of type [${typesAsString}] cannot have tags`);
        if (tag.link)
            validations.push(`Tag [${tag.tag}] of type [${typesAsString}] cannot have link`);
        if (tag.trackBy)
            validations.push(`Tag [${tag.tag}] of type [${typesAsString}] cannot have trackBy`);
    }

    const description = parseDescription(tag.description);
    const elementType = parseElementType(tag.elementType);
    const required = tag.required;

    // Parse phase attribute
    const phaseResult = parsePhase(tag.phase, tag.tag, types.val);
    validations.push(...phaseResult.validations);
    const phase = phaseResult.val;

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
                    ...(tag.trackBy && { trackBy: tag.trackBy }),
                    ...(phase && { phase }),
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
                ...(tag.trackBy && { trackBy: tag.trackBy }),
                ...(tag.async && { async: tag.async }),
                ...(phase && { phase }),
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
            ...(phase && { phase }),
        };

        return new WithValidations<ContractTag>(contractTag, validations);
    }
}

export function parseContract(contractYaml: string, fileName: string): WithValidations<Contract> {
    try {
        const parsedYaml = yaml.load(contractYaml) as ParsedYaml;
        const validations: string[] = [];

        if (!parsedYaml.name) {
            validations.push('Contract must have a name');
        }
        if (!parsedYaml.tags && !Array.isArray(parsedYaml.tags)) {
            validations.push('Contract must have tags as an array of the contract tags');
        }

        if (validations.length > 0) {
            return new WithValidations(undefined, validations);
        }

        const tagResults = parsedYaml.tags.map((tag) => parseTag(tag));
        const tagValidations = tagResults.flatMap((tr) => tr.validations);
        const parsedTags = tagResults
            .map((tr) => tr.val)
            .filter((tag): tag is ContractTag => !!tag);

        // Check for duplicate tag names at root level
        const tagNames = new Set<string>();

        parsedTags.forEach((tag) => {
            if (tagNames.has(tag.tag)) {
                validations.push(`Duplicate tag name [${tag.tag}]`);
            }
            tagNames.add(tag.tag);
        });

        const contract: Contract = {
            name: parsedYaml.name,
            tags: parsedTags,
        };

        // Validate phase constraints
        const phaseValidations = validateContractPhases(contract);

        return new WithValidations<Contract>(contract, [
            ...tagValidations,
            ...validations,
            ...phaseValidations,
        ]);
    } catch (e) {
        throw new Error(`failed to parse contract YAML for ${fileName}, ${e.message}.`);
    }
}
