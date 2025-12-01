import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import {
    FlattenedAccessChain,
    VariableRootType,
    isImportModuleVariableRoot,
} from './name-binding-resolver';

const { isStringLiteral } = tsBridge;

/**
 * Compare two FlattenedAccessChain objects for equality
 * 
 * Two chains are equal if:
 * 1. Their paths are identical (same length, same elements in order)
 * 2. Their roots refer to the same source
 */
export function areFlattenedAccessChainsEqual(
    chain1: FlattenedAccessChain,
    chain2: FlattenedAccessChain,
): boolean {
    // Compare paths
    if (chain1.path.length !== chain2.path.length) {
        return false;
    }
    
    const pathsEqual = chain1.path.every((value, index) => value === chain2.path[index]);
    if (!pathsEqual) {
        return false;
    }
    
    // Compare roots
    return areVariableRootsEqual(chain1.root, chain2.root);
}

/**
 * Compare two VariableRoot objects for equality
 */
function areVariableRootsEqual(root1: any, root2: any): boolean {
    // Both undefined/null
    if (!root1 && !root2) {
        return true;
    }
    
    // One is undefined/null
    if (!root1 || !root2) {
        return false;
    }
    
    // Different kinds
    if (root1.kind !== root2.kind) {
        return false;
    }
    
    // Compare based on kind
    switch (root1.kind) {
        case VariableRootType.ImportModule:
            // For imports, compare module path and import type (not node instances)
            if (isImportModuleVariableRoot(root1) && isImportModuleVariableRoot(root2)) {
                const module1 = isStringLiteral(root1.module) ? root1.module.text : String(root1.module);
                const module2 = isStringLiteral(root2.module) ? root2.module.text : String(root2.module);
                return module1 === module2 && root1.importType === root2.importType;
            }
            return false;
            
        case VariableRootType.FunctionParameter:
        case VariableRootType.FunctionDefinition:
        case VariableRootType.Literal:
        case VariableRootType.FunctionCall:
            // For these, we can't reliably compare across transformations
            // since node instances change. For builder method removal, we only care about
            // ImportModule roots anyway, so this is safe.
            return true;
            
        case VariableRootType.Global:
        case VariableRootType.Other:
            // For global/other, just having the same kind is enough
            return true;
            
        default:
            return false;
    }
}

