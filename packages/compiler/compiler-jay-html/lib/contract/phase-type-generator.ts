import { Contract, ContractTag, ContractTagType, RenderingPhase } from './contract';
import { filterTagsByPhase, getEffectivePhase } from './contract-phase-validator';
import { loadLinkedContract, getLinkedContractDir } from './linked-contract-resolver';
import { JayImportResolver } from '../jay-target/jay-import-resolver';
import { pascalCase } from 'change-case';
import { camelCase } from '../case-utils';

/**
 * Check if a property should be included in a target phase's ViewState
 *
 * Rules:
 * - slow: only properties with phase 'slow'
 * - fast: properties with phase 'fast' OR 'fast+interactive' (since they're set at request time)
 * - fast+interactive: only properties with phase 'fast+interactive'
 */
function shouldIncludeInPhase(propertyPhase: RenderingPhase, targetPhase: RenderingPhase): boolean {
    if (targetPhase === 'slow') {
        return propertyPhase === 'slow';
    } else if (targetPhase === 'fast') {
        return propertyPhase === 'fast' || propertyPhase === 'fast+interactive';
    } else if (targetPhase === 'fast+interactive') {
        return propertyPhase === 'fast+interactive';
    }
    return false;
}

interface PropertyPath {
    path: string[];
    propertyName: string;
}

interface ArrayInfo {
    path: string; // full path to the array property (e.g., "items" or "user.addresses")
}

interface AsyncInfo {
    path: string; // full path to the async (Promise) property
}

/**
 * Context for resolving linked contracts during phase extraction
 */
interface LinkedContractContext {
    importResolver: JayImportResolver;
    contractDir: string;
}

/**
 * Extract property paths for a specific phase from contract tags
 * Returns property paths, arrays info, and async (Promise) info
 */
function extractPropertyPathsAndArrays(
    tags: ContractTag[],
    targetPhase: RenderingPhase,
    parentPath: string[] = [],
    parentPhase?: RenderingPhase,
    parentTrackBy?: string, // trackBy field from parent repeated sub-contract
    linkedContext?: LinkedContractContext, // Context for resolving linked contracts
): { paths: PropertyPath[]; arrays: ArrayInfo[]; asyncProps: AsyncInfo[] } {
    const paths: PropertyPath[] = [];
    const arrays: ArrayInfo[] = [];
    const asyncProps: AsyncInfo[] = [];

    for (const tag of tags) {
        // Skip interactive tags without dataType (they go into Refs)
        if (tag.type.includes(ContractTagType.interactive) && !tag.dataType) {
            continue;
        }

        const effectivePhase = getEffectivePhase(tag, parentPhase);
        const propertyName = camelCase(tag.tag);
        const currentPath = [...parentPath, propertyName];
        const isArray = tag.repeated || false;
        const isAsync = tag.async || false;

        // Check if this tag is a sub-contract (inline tags or linked)
        if (tag.type.includes(ContractTagType.subContract)) {
            // Check if it's a recursive reference (e.g., "$/" or "$/data")
            const isRecursiveLink = tag.link?.startsWith('$/');

            if (isRecursiveLink) {
                // Recursive reference - include the property if it belongs to this phase
                // but don't try to process child properties (they're the same type)
                if (shouldIncludeInPhase(effectivePhase, targetPhase)) {
                    paths.push({
                        path: parentPath,
                        propertyName,
                    });

                    // Record if it's an array
                    if (isArray) {
                        arrays.push({ path: currentPath.join('.') });
                    }

                    // Record if it's async
                    if (isAsync) {
                        asyncProps.push({ path: currentPath.join('.') });
                    }
                }
            } else {
                // Get child tags - either inline or from linked contract
                let childTags: ContractTag[] = [];
                let childLinkedContext = linkedContext;

                if (tag.tags) {
                    // Inline nested tags
                    childTags = tag.tags;
                } else if (tag.link && linkedContext) {
                    // External linked contract - resolve and use its tags
                    const linkedContract = loadLinkedContract(
                        tag.link,
                        linkedContext.contractDir,
                        linkedContext.importResolver,
                    );
                    if (linkedContract) {
                        childTags = linkedContract.tags;
                        // Update context for nested links
                        childLinkedContext = {
                            importResolver: linkedContext.importResolver,
                            contractDir: getLinkedContractDir(
                                tag.link,
                                linkedContext.contractDir,
                                linkedContext.importResolver,
                            ),
                        };
                    }
                }

                if (childTags.length > 0) {
                    // For repeated sub-contracts, pass trackBy to children
                    const trackByForChildren = isArray ? tag.trackBy : undefined;

                    // Recursively process nested tags
                    const result = extractPropertyPathsAndArrays(
                        childTags,
                        targetPhase,
                        currentPath,
                        effectivePhase,
                        trackByForChildren,
                        childLinkedContext,
                    );

                    // For repeated sub-contracts, skip if only the trackBy field is present
                    // (no point having an array with only identity fields)
                    const hasOnlyTrackBy =
                        isArray &&
                        trackByForChildren &&
                        result.paths.length === 1 &&
                        result.paths[0].propertyName === camelCase(trackByForChildren);

                    // Only include this object/array if it has properties in this phase
                    // and it's not an array with only the trackBy field
                    if (result.paths.length > 0 && !hasOnlyTrackBy) {
                        paths.push(...result.paths);
                        arrays.push(...result.arrays);
                        asyncProps.push(...result.asyncProps);

                        // If this is an array, record it
                        if (isArray) {
                            arrays.push({ path: currentPath.join('.') });
                        }

                        // If this is async, record it
                        if (isAsync) {
                            asyncProps.push({ path: currentPath.join('.') });
                        }
                    }
                }
            }
        } else {
            // Leaf property - include if it should be in the target phase
            // OR if it's the trackBy field (always included in all phases)
            const isTrackByField = parentTrackBy === tag.tag;

            if (shouldIncludeInPhase(effectivePhase, targetPhase) || isTrackByField) {
                paths.push({
                    path: parentPath,
                    propertyName,
                });
            }
        }
    }

    return { paths, arrays, asyncProps };
}

/**
 * Group property paths by their parent path
 */
function groupPathsByParent(paths: PropertyPath[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();

    for (const { path, propertyName } of paths) {
        const parentKey = path.join('.');
        if (!grouped.has(parentKey)) {
            grouped.set(parentKey, []);
        }
        grouped.get(parentKey)!.push(propertyName);
    }

    return grouped;
}

/**
 * Count total properties in a contract object/array
 * Follows linked contracts via import resolver if provided
 */
function countTotalProperties(
    tags: ContractTag[],
    targetPath: string[],
    currentPath: string[] = [],
    linkedContext?: LinkedContractContext,
): number {
    let count = 0;

    for (const tag of tags) {
        // Skip interactive tags without dataType
        if (tag.type.includes(ContractTagType.interactive) && !tag.dataType) {
            continue;
        }

        const propertyName = camelCase(tag.tag);
        const newPath = [...currentPath, propertyName];
        const pathKey = newPath.join('.');
        const targetKey = targetPath.join('.');

        // If this is the target path, count its direct children
        if (pathKey === targetKey && tag.type.includes(ContractTagType.subContract)) {
            // Get child tags - either inline or from linked contract
            let childTags: ContractTag[] = [];

            if (tag.tags) {
                childTags = tag.tags;
            } else if (tag.link && linkedContext && !tag.link.startsWith('$/')) {
                const linkedContract = loadLinkedContract(
                    tag.link,
                    linkedContext.contractDir,
                    linkedContext.importResolver,
                );
                if (linkedContract) {
                    childTags = linkedContract.tags;
                }
            }

            for (const childTag of childTags) {
                if (childTag.type.includes(ContractTagType.interactive) && !childTag.dataType) {
                    continue;
                }
                count++;
            }
            return count;
        }

        // Continue searching if we haven't reached the target yet
        if (tag.type.includes(ContractTagType.subContract)) {
            let childTags: ContractTag[] = [];
            let childLinkedContext = linkedContext;

            if (tag.tags) {
                childTags = tag.tags;
            } else if (tag.link && linkedContext && !tag.link.startsWith('$/')) {
                const linkedContract = loadLinkedContract(
                    tag.link,
                    linkedContext.contractDir,
                    linkedContext.importResolver,
                );
                if (linkedContract) {
                    childTags = linkedContract.tags;
                    childLinkedContext = {
                        importResolver: linkedContext.importResolver,
                        contractDir: getLinkedContractDir(
                            tag.link,
                            linkedContext.contractDir,
                            linkedContext.importResolver,
                        ),
                    };
                }
            }

            if (childTags.length > 0) {
                const result = countTotalProperties(
                    childTags,
                    targetPath,
                    newPath,
                    childLinkedContext,
                );
                if (result > 0) {
                    return result;
                }
            }
        }
    }

    return count;
}

/**
 * Build a type path access string, inserting [number] after array properties
 * e.g., for path ['options', 'items'] where 'options' is an array:
 * returns "BaseType['options'][number]['items']"
` *
 * For async arrays, does NOT add [number] at the final path segment since we need
 * to unwrap with Awaited first
 */
function buildPathAccess(
    baseTypeName: string,
    path: string[],
    arrays: Set<string>,
    asyncProps?: Set<string>,
    skipFinalArrayAccess = false,
): string {
    if (path.length === 0) {
        return baseTypeName;
    }

    let result = baseTypeName;
    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        result += `['${segment}']`;

        // Check if this path segment is an array (need to add [number] to access item type)
        const pathUpToHere = path.slice(0, i + 1).join('.');
        const isArray = arrays.has(pathUpToHere);
        const isAsync = asyncProps?.has(pathUpToHere);
        const isFinalSegment = i === path.length - 1;

        // Skip [number] for the final segment if:
        // 1. skipFinalArrayAccess is true, OR
        // 2. This is an async array (needs Awaited first)
        const shouldSkip = isFinalSegment && (skipFinalArrayAccess || (isArray && isAsync));

        if (isArray && !shouldSkip) {
            result += '[number]';
        }
    }
    return result;
}

/**
 * Check if all properties at a given path (and recursively all nested properties) are fully included
 */
function isFullyIncluded(
    pathGroups: Map<string, string[]>,
    contractTags: ContractTag[],
    currentPath: string[],
    linkedContext?: LinkedContractContext,
): boolean {
    const currentKey = currentPath.join('.');
    const properties = pathGroups.get(currentKey) || [];

    // Count total properties at this level
    const totalProps = countTotalProperties(contractTags, currentPath, [], linkedContext);
    if (totalProps === 0) {
        return false;
    }

    // Find all child paths (nested properties)
    const childPropertyNames = new Set<string>();
    const prefix = currentKey ? currentKey + '.' : '';
    for (const key of pathGroups.keys()) {
        if (key.startsWith(prefix) && key !== currentKey) {
            const remainingPath = key.slice(prefix.length);
            const firstSegment = remainingPath.split('.')[0];
            if (firstSegment) {
                childPropertyNames.add(firstSegment);
            }
        }
    }

    // Direct (leaf) properties
    const directProps = properties.filter((p) => !childPropertyNames.has(p));

    // Check if all properties are accounted for
    if (directProps.length + childPropertyNames.size !== totalProps) {
        return false;
    }

    // Recursively check all nested children
    for (const childName of childPropertyNames) {
        const childPath = [...currentPath, childName];
        if (!isFullyIncluded(pathGroups, contractTags, childPath, linkedContext)) {
            return false;
        }
    }

    return true;
}

/**
 * Build nested Pick type expression
 */
function buildPickExpression(
    baseTypeName: string,
    pathGroups: Map<string, string[]>,
    arrays: Set<string>,
    asyncProps: Set<string>,
    contractTags: ContractTag[],
    currentPath: string[] = [],
    linkedContext?: LinkedContractContext,
): string {
    const currentKey = currentPath.join('.');
    const properties = pathGroups.get(currentKey) || [];

    // Find all child paths (properties with nested picks)
    const childPropertyNames = new Set<string>();
    for (const key of pathGroups.keys()) {
        // Match child paths: if currentKey is empty, match top-level paths (no dots)
        // if currentKey is not empty, match paths that start with "currentKey."
        const prefix = currentKey ? currentKey + '.' : '';
        if (key.startsWith(prefix) && key !== currentKey) {
            const remainingPath = key.slice(prefix.length);
            const firstSegment = remainingPath.split('.')[0];
            if (firstSegment) {
                childPropertyNames.add(firstSegment);
            }
        }
    }

    // Build type expression
    const pickPart: string[] = [];
    const nestedProperties: string[] = [];

    // Add Pick for direct (leaf) properties
    const directProps = properties.filter((p) => !childPropertyNames.has(p));
    if (directProps.length > 0) {
        const pathAccess = buildPathAccess(baseTypeName, currentPath, arrays, asyncProps);
        pickPart.push(`Pick<${pathAccess}, ${directProps.map((p) => `'${p}'`).join(' | ')}>`);
    }

    // Add nested objects/arrays/promises with Pick expressions
    for (const childName of childPropertyNames) {
        const childPath = [...currentPath, childName];
        const childPathKey = childPath.join('.');
        const isArray = arrays.has(childPathKey);
        const isAsync = asyncProps.has(childPathKey);

        // Check if this nested object (and all its descendants) are fully included
        const isChildFullyIncluded = isFullyIncluded(
            pathGroups,
            contractTags,
            childPath,
            linkedContext,
        );

        // Build path access for this child
        const originalPathAccess = buildPathAccess(baseTypeName, childPath, arrays, asyncProps);

        if (isChildFullyIncluded) {
            // All properties (recursively) are included - use direct type reference
            let fullExpression: string;
            const directTypeRef = originalPathAccess;

            // Handle async properties (Promises)
            if (isAsync) {
                if (isArray) {
                    fullExpression = `Promise<Array<Awaited<${directTypeRef}>[number]>>`;
                } else {
                    // For non-array Promise, the type is already Promise<T>, just reference it
                    fullExpression = directTypeRef;
                }
            } else if (isArray) {
                fullExpression = `Array<${directTypeRef}>`;
            } else {
                fullExpression = directTypeRef;
            }

            nestedProperties.push(`    ${childName}: ${fullExpression};`);
        } else {
            // Not all properties included - need to build Pick expression
            // Recursively build child expression
            const childExpression = buildPickExpression(
                baseTypeName,
                pathGroups,
                arrays,
                asyncProps,
                contractTags,
                childPath,
                linkedContext,
            );

            if (childExpression) {
                let fullExpression: string;

                // Handle async properties (Promises)
                if (isAsync) {
                    // For Promise properties, unwrap with Awaited first, then apply [number] for arrays
                    if (isArray) {
                        // Promise<Array<...>> - unwrap Promise, then access array element
                        const unwrappedArrayAccess = `Awaited<${originalPathAccess}>[number]`;
                        const unwrappedExpression = childExpression.replace(
                            originalPathAccess,
                            unwrappedArrayAccess,
                        );
                        fullExpression = `Promise<Array<${unwrappedExpression}>>`;
                    } else {
                        // Promise<Object> - just unwrap Promise
                        const unwrappedAccess = `Awaited<${originalPathAccess}>`;
                        const unwrappedExpression = childExpression.replace(
                            originalPathAccess,
                            unwrappedAccess,
                        );
                        fullExpression = `Promise<${unwrappedExpression}>`;
                    }
                } else if (isArray) {
                    // For arrays (non-Promise), wrap with Array<>
                    fullExpression = `Array<${childExpression}>`;
                } else {
                    // Regular nested object
                    fullExpression = childExpression;
                }

                nestedProperties.push(`    ${childName}: ${fullExpression};`);
            }
        }
    }

    // Combine Pick part and nested properties
    if (pickPart.length === 0 && nestedProperties.length === 0) {
        return '{}';
    } else if (pickPart.length === 0) {
        // Only nested properties
        return `{\n${nestedProperties.join('\n')}\n}`;
    } else if (nestedProperties.length === 0) {
        // Only Pick
        return pickPart[0];
    } else {
        // Both Pick and nested properties - combine with single object
        return `${pickPart[0]} & {\n${nestedProperties.join('\n')}\n}`;
    }
}

/**
 * Generate phase-specific ViewState type using Pick utilities
 *
 * @param contract - The contract to generate types for
 * @param phase - The rendering phase to generate types for
 * @param baseTypeName - The base ViewState type name to Pick from
 * @param importResolver - Optional import resolver for resolving linked contracts
 * @param contractPath - Optional path to the contract file (for resolving relative links)
 */
export function generatePhaseViewStateType(
    contract: Contract,
    phase: RenderingPhase,
    baseTypeName: string,
    importResolver?: JayImportResolver,
    contractPath?: string,
): string {
    const phaseName = phase === 'fast+interactive' ? 'Interactive' : pascalCase(phase);
    const typeName = `${pascalCase(contract.name)}${phaseName}ViewState`;

    // Create linked contract context if resolver is available
    const linkedContext: LinkedContractContext | undefined =
        importResolver && contractPath
            ? {
                  importResolver,
                  contractDir: contractPath.includes('/')
                      ? contractPath.substring(0, contractPath.lastIndexOf('/'))
                      : '.',
              }
            : undefined;

    // Extract property paths, array info, and async info for this phase
    const { paths, arrays, asyncProps } = extractPropertyPathsAndArrays(
        contract.tags,
        phase,
        [],
        undefined,
        undefined,
        linkedContext,
    );

    // If no properties, return empty type
    if (paths.length === 0) {
        return `export type ${typeName} = {};`;
    }

    // Group paths by parent
    const pathGroups = groupPathsByParent(paths);

    // Create sets for quick lookup
    const arraySet = new Set(arrays.map((a) => a.path));
    const asyncSet = new Set(asyncProps.map((a) => a.path));

    // Build Pick expression
    const pickExpression = buildPickExpression(
        baseTypeName,
        pathGroups,
        arraySet,
        asyncSet,
        contract.tags,
        [],
        linkedContext,
    );

    return `export type ${typeName} = ${pickExpression};`;
}

/**
 * Generate all three phase-specific ViewState types
 *
 * @param contract - The contract to generate types for
 * @param baseTypeName - The base ViewState type name to Pick from
 * @param importResolver - Optional import resolver for resolving linked contracts
 * @param contractPath - Optional path to the contract file (for resolving relative links)
 */
export function generateAllPhaseViewStateTypes(
    contract: Contract,
    baseTypeName: string,
    importResolver?: JayImportResolver,
    contractPath?: string,
): string {
    const slowType = generatePhaseViewStateType(
        contract,
        'slow',
        baseTypeName,
        importResolver,
        contractPath,
    );
    const fastType = generatePhaseViewStateType(
        contract,
        'fast',
        baseTypeName,
        importResolver,
        contractPath,
    );
    const interactiveType = generatePhaseViewStateType(
        contract,
        'fast+interactive',
        baseTypeName,
        importResolver,
        contractPath,
    );

    return [slowType, fastType, interactiveType].join('\n\n');
}
