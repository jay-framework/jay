import { Contract, ContractTag, ContractTagType, RenderingPhase } from './contract';
import { filterTagsByPhase, getEffectivePhase } from './contract-phase-validator';
import { pascalCase, camelCase } from 'change-case';

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
 * Extract property paths for a specific phase from contract tags
 * Returns property paths, arrays info, and async (Promise) info
 */
function extractPropertyPathsAndArrays(
    tags: ContractTag[],
    targetPhase: RenderingPhase,
    parentPath: string[] = [],
    parentPhase?: RenderingPhase,
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

        // Check if this tag has nested tags (sub-contract)
        if (tag.type.includes(ContractTagType.subContract) && tag.tags) {
            // Recursively process nested tags
            const result = extractPropertyPathsAndArrays(
                tag.tags,
                targetPhase,
                currentPath,
                effectivePhase,
            );

            // Only include this object/array if it has properties in this phase
            if (result.paths.length > 0) {
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
        } else {
            // Leaf property - include if it should be in the target phase
            if (shouldIncludeInPhase(effectivePhase, targetPhase)) {
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
 */
function countTotalProperties(
    tags: ContractTag[],
    targetPath: string[],
    currentPath: string[] = [],
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
        if (pathKey === targetKey && tag.type.includes(ContractTagType.subContract) && tag.tags) {
            for (const childTag of tag.tags) {
                if (childTag.type.includes(ContractTagType.interactive) && !childTag.dataType) {
                    continue;
                }
                count++;
            }
            return count;
        }
        
        // Continue searching if we haven't reached the target yet
        if (tag.type.includes(ContractTagType.subContract) && tag.tags) {
            const result = countTotalProperties(tag.tags, targetPath, newPath);
            if (result > 0) {
                return result;
            }
        }
    }
    
    return count;
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
        const pathAccess =
            currentPath.length > 0
                ? `${baseTypeName}${currentPath.map((p) => `['${p}']`).join('')}`
                : baseTypeName;

        pickPart.push(`Pick<${pathAccess}, ${directProps.map((p) => `'${p}'`).join(' | ')}>`);
    }

    // Add nested objects/arrays/promises with Pick expressions
    for (const childName of childPropertyNames) {
        const childPath = [...currentPath, childName];
        const childPathKey = childPath.join('.');
        const isArray = arrays.has(childPathKey);
        const isAsync = asyncProps.has(childPathKey);

        // Check if we're picking ALL properties of this nested object
        const childProperties = pathGroups.get(childPathKey) || [];
        const totalProperties = countTotalProperties(contractTags, childPath);
        const isPickingAllProperties = totalProperties > 0 && childProperties.length === totalProperties;

        // Recursively build child expression
        const childExpression = buildPickExpression(
            baseTypeName,
            pathGroups,
            arrays,
            asyncProps,
            contractTags,
            childPath,
        );

        if (childExpression) {
            let fullExpression: string;
            const originalPathAccess = `${baseTypeName}${childPath.map((p) => `['${p}']`).join('')}`;

            // If we're picking all properties of a leaf object (no further nesting), just use the type reference
            if (isPickingAllProperties && childExpression === `Pick<${originalPathAccess}, ${childProperties.map((p) => `'${p}'`).join(' | ')}>`) {
                // Use direct type reference instead of Pick
                const directTypeRef = originalPathAccess;

                // Handle async properties (Promises)
                if (isAsync) {
                    if (isArray) {
                        fullExpression = `Promise<Array<${directTypeRef}[number]>>`;
                    } else {
                        fullExpression = `Promise<${directTypeRef}>`;
                    }
                } else if (isArray) {
                    fullExpression = `Array<${directTypeRef}[number]>`;
                } else {
                    fullExpression = directTypeRef;
                }
            } else {
                // Use Pick expression as before
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
                    // For arrays (non-Promise), wrap with Array<> and use [number] to access element type
                    const arrayElementAccess = `${originalPathAccess}[number]`;
                    fullExpression = `Array<${childExpression.replace(originalPathAccess, arrayElementAccess)}>`;
                } else {
                    // Regular nested object
                    fullExpression = childExpression;
                }
            }

            nestedProperties.push(`    ${childName}: ${fullExpression};`);
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
 */
export function generatePhaseViewStateType(
    contract: Contract,
    phase: RenderingPhase,
    baseTypeName: string,
): string {
    const phaseName = phase === 'fast+interactive' ? 'Interactive' : pascalCase(phase);
    const typeName = `${pascalCase(contract.name)}${phaseName}ViewState`;

    // Extract property paths, array info, and async info for this phase
    const { paths, arrays, asyncProps } = extractPropertyPathsAndArrays(contract.tags, phase);

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
    const pickExpression = buildPickExpression(baseTypeName, pathGroups, arraySet, asyncSet, contract.tags);

    return `export type ${typeName} = ${pickExpression};`;
}

/**
 * Generate all three phase-specific ViewState types
 */
export function generateAllPhaseViewStateTypes(contract: Contract, baseTypeName: string): string {
    const slowType = generatePhaseViewStateType(contract, 'slow', baseTypeName);
    const fastType = generatePhaseViewStateType(contract, 'fast', baseTypeName);
    const interactiveType = generatePhaseViewStateType(contract, 'fast+interactive', baseTypeName);

    return [slowType, fastType, interactiveType].join('\n\n');
}
