import { Contract, ContractTag, ContractTagType, RenderingPhase } from './contract';
import { filterTagsByPhase, getEffectivePhase } from './contract-phase-validator';
import { pascalCase, camelCase } from 'change-case';

interface PropertyPath {
    path: string[];
    propertyName: string;
}

interface ArrayInfo {
    path: string; // full path to the array property (e.g., "items" or "user.addresses")
}

/**
 * Extract property paths for a specific phase from contract tags
 * Returns both the property paths and information about which properties are arrays
 */
function extractPropertyPathsAndArrays(
    tags: ContractTag[],
    targetPhase: RenderingPhase,
    parentPath: string[] = [],
    parentPhase?: RenderingPhase
): { paths: PropertyPath[]; arrays: ArrayInfo[] } {
    const paths: PropertyPath[] = [];
    const arrays: ArrayInfo[] = [];
    
    for (const tag of tags) {
        // Skip interactive tags without dataType (they go into Refs)
        if (tag.type.includes(ContractTagType.interactive) && !tag.dataType) {
            continue;
        }
        
        const effectivePhase = getEffectivePhase(tag, parentPhase);
        const propertyName = camelCase(tag.tag);
        const currentPath = [...parentPath, propertyName];
        const isArray = tag.repeated || false;
        
        // Check if this tag has nested tags (sub-contract)
        if (tag.type.includes(ContractTagType.subContract) && tag.tags) {
            // Recursively process nested tags
            const result = extractPropertyPathsAndArrays(
                tag.tags,
                targetPhase,
                currentPath,
                effectivePhase
            );
            
            // Only include this object/array if it has properties in this phase
            if (result.paths.length > 0) {
                paths.push(...result.paths);
                arrays.push(...result.arrays);
                
                // If this is an array, record it
                if (isArray) {
                    arrays.push({ path: currentPath.join('.') });
                }
            }
        } else {
            // Leaf property - include if it matches the target phase
            if (effectivePhase === targetPhase) {
                paths.push({
                    path: parentPath,
                    propertyName
                });
            }
        }
    }
    
    return { paths, arrays };
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
 * Build nested Pick type expression
 */
function buildPickExpression(
    baseTypeName: string,
    pathGroups: Map<string, string[]>,
    arrays: Set<string>,
    currentPath: string[] = []
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
    const parts: string[] = [];
    
    // Add Pick for direct (leaf) properties
    const directProps = properties.filter(p => !childPropertyNames.has(p));
    if (directProps.length > 0) {
        const pathAccess = currentPath.length > 0
            ? `${baseTypeName}${currentPath.map(p => `['${p}']`).join('')}`
            : baseTypeName;
        
        parts.push(`Pick<${pathAccess}, ${directProps.map(p => `'${p}'`).join(' | ')}>`);
    }
    
    // Add nested objects/arrays with Pick expressions
    for (const childName of childPropertyNames) {
        const childPath = [...currentPath, childName];
        const childPathKey = childPath.join('.');
        const isArray = arrays.has(childPathKey);
        
        // Recursively build child expression
        const childExpression = buildPickExpression(
            baseTypeName,
            pathGroups,
            arrays,
            childPath
        );
        
        if (childExpression) {
            // For arrays, wrap the Pick expression with Array<> and use [number] to access element type
            let fullExpression: string;
            if (isArray) {
                // Replace the path access in the child expression to use [number]
                const originalPathAccess = `${baseTypeName}${childPath.map(p => `['${p}']`).join('')}`;
                const arrayElementAccess = `${originalPathAccess}[number]`;
                fullExpression = `Array<${childExpression.replace(originalPathAccess, arrayElementAccess)}>`;
            } else {
                fullExpression = childExpression;
            }
            
            parts.push(`{\n    ${childName}: ${fullExpression};\n  }`);
        }
    }
    
    // Combine with intersection
    if (parts.length === 0) {
        return '{}';
    } else if (parts.length === 1) {
        return parts[0];
    } else {
        return parts.join(' & ');
    }
}

/**
 * Generate phase-specific ViewState type using Pick utilities
 */
export function generatePhaseViewStateType(
    contract: Contract,
    phase: RenderingPhase,
    baseTypeName: string
): string {
    const phaseName = phase === 'fast+interactive' ? 'Interactive' : pascalCase(phase);
    const typeName = `${pascalCase(contract.name)}${phaseName}ViewState`;
    
    // Extract property paths and array info for this phase
    const { paths, arrays } = extractPropertyPathsAndArrays(contract.tags, phase);
    
    // If no properties, return empty type
    if (paths.length === 0) {
        return `export type ${typeName} = {};`;
    }
    
    // Group paths by parent
    const pathGroups = groupPathsByParent(paths);
    
    // Create a set of array paths for quick lookup
    const arraySet = new Set(arrays.map(a => a.path));
    
    // Build Pick expression
    const pickExpression = buildPickExpression(baseTypeName, pathGroups, arraySet);
    
    return `export type ${typeName} = ${pickExpression};`;
}

/**
 * Generate all three phase-specific ViewState types
 */
export function generateAllPhaseViewStateTypes(
    contract: Contract,
    baseTypeName: string
): string {
    const slowType = generatePhaseViewStateType(contract, 'slow', baseTypeName);
    const fastType = generatePhaseViewStateType(contract, 'fast', baseTypeName);
    const interactiveType = generatePhaseViewStateType(contract, 'fast+interactive', baseTypeName);
    
    return [slowType, fastType, interactiveType].join('\n\n');
}

