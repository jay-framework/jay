/**
 * Compiler for .jay-action files → .jay-action.d.ts
 *
 * Generates TypeScript Input/Output interfaces from JayType trees,
 * including import statements for contract references (JayImportedType).
 */

import {
    WithValidations,
    JayType,
    JayObjectType,
    JayArrayType,
    JayEnumType,
    JayImportedType,
    JayOptionalType,
    JayAtomicType,
    isObjectType,
    isArrayType,
    isEnumType,
    isAtomicType,
    isImportedType,
    isOptionalType,
} from '@jay-framework/compiler-shared';
import { ActionDefinition } from './action-parser';
import { pascalCase } from 'change-case';

// ============================================================================
// Contract resolution
// ============================================================================

export interface ContractImportInfo {
    importPath: string;
    viewStateName: string;
}

export type ContractResolver = (contractSubpath: string) => ContractImportInfo | null;

/**
 * Default contract resolver that derives names from the subpath.
 */
export function defaultContractResolver(contractSubpath: string): ContractImportInfo {
    const baseName = contractSubpath.replace('.jay-contract', '');
    const viewStateName = pascalCase(baseName) + 'ViewState';
    return { importPath: `./${contractSubpath}`, viewStateName };
}

// ============================================================================
// Collect contract aliases from JayType tree
// ============================================================================

function collectImportedAliases(type: JayType, aliases: Set<string>): void {
    if (isImportedType(type)) {
        aliases.add(type.name);
    } else if (isOptionalType(type)) {
        collectImportedAliases(type.innerType, aliases);
    } else if (isObjectType(type)) {
        for (const prop of Object.values(type.props)) {
            collectImportedAliases(prop, aliases);
        }
    } else if (isArrayType(type)) {
        collectImportedAliases(type.itemType, aliases);
    }
}

// ============================================================================
// Type rendering (JayType → TypeScript)
// ============================================================================

/**
 * Renders a JayType as a TypeScript type string.
 * Action-specific: enums as inline unions, objects as inline blocks.
 */
function renderType(type: JayType, aliasToViewState: Map<string, string>, indent: string): string {
    if (isOptionalType(type)) {
        return renderType(type.innerType, aliasToViewState, indent);
    }

    if (isAtomicType(type)) {
        return type.name;
    }

    if (isEnumType(type)) {
        return type.values.map((v) => `'${v}'`).join(' | ');
    }

    if (isImportedType(type)) {
        const viewStateName = aliasToViewState.get(type.name) || type.name;
        return type.isOptional ? `${viewStateName} | null` : viewStateName;
    }

    if (isArrayType(type)) {
        const itemStr = renderType(type.itemType, aliasToViewState, indent + '  ');
        return `Array<${itemStr}>`;
    }

    if (isObjectType(type)) {
        if (Object.keys(type.props).length === 0) {
            return 'Record<string, unknown>';
        }
        return renderInlineObject(type, aliasToViewState, indent);
    }

    return 'unknown';
}

/**
 * Renders a JayObjectType as an inline `{ ... }` block.
 */
function renderInlineObject(
    type: JayObjectType,
    aliasToViewState: Map<string, string>,
    indent: string,
): string {
    const childIndent = indent + '  ';
    const lines = Object.entries(type.props).map(([prop, propType]) => {
        const optional = isOptionalType(propType) ? '?' : '';
        const tsType = renderType(propType, aliasToViewState, childIndent);
        return `${childIndent}${prop}${optional}: ${tsType};`;
    });
    return `{\n${lines.join('\n')}\n${indent}}`;
}

/**
 * Renders a top-level interface from a JayObjectType.
 */
function renderInterface(
    interfaceName: string,
    type: JayObjectType,
    aliasToViewState: Map<string, string>,
): string {
    const propKeys = Object.keys(type.props);
    if (propKeys.length === 0) {
        return `export interface ${interfaceName} {}`;
    }

    const lines = propKeys.map((prop) => {
        const optional = isOptionalType(type.props[prop]) ? '?' : '';
        const tsType = renderType(type.props[prop], aliasToViewState, '  ');
        return `  ${prop}${optional}: ${tsType};`;
    });

    return `export interface ${interfaceName} {\n${lines.join('\n')}\n}`;
}

/**
 * Renders the output type (interface for objects, type alias for other shapes).
 */
function renderOutputType(
    typeName: string,
    outputType: JayType,
    aliasToViewState: Map<string, string>,
): string {
    if (isObjectType(outputType) && Object.keys(outputType.props).length > 0) {
        return renderInterface(typeName, outputType, aliasToViewState);
    }

    const tsType = renderType(outputType, aliasToViewState, '');
    return `export type ${typeName} = ${tsType};`;
}

// ============================================================================
// Main compiler
// ============================================================================

/**
 * Compiles an ActionDefinition (with JayType) into a TypeScript .d.ts string.
 */
export function compileAction(
    actionWithValidations: WithValidations<ActionDefinition>,
    contractResolver: ContractResolver = defaultContractResolver,
): WithValidations<string> {
    return actionWithValidations.map((action) => {
        const baseName = pascalCase(action.name);
        const sections: string[] = [];

        // Collect all JayImportedType aliases used in the tree
        const usedAliases = new Set<string>();
        collectImportedAliases(action.inputType, usedAliases);
        if (action.outputType) {
            collectImportedAliases(action.outputType, usedAliases);
        }

        // Resolve aliases to ViewState names and import paths
        const aliasToViewState = new Map<string, string>();
        const importStatements: string[] = [];

        for (const alias of usedAliases) {
            const contractSubpath = action.imports[alias];
            if (!contractSubpath) continue;

            const resolved = contractResolver(contractSubpath);
            if (!resolved) continue;

            aliasToViewState.set(alias, resolved.viewStateName);
            importStatements.push(
                `import { ${resolved.viewStateName} } from '${resolved.importPath}';`,
            );
        }

        if (importStatements.length > 0) {
            sections.push(importStatements.join('\n'));
        }

        // Input interface
        sections.push(renderInterface(`${baseName}Input`, action.inputType, aliasToViewState));

        // Output type (optional)
        if (action.outputType) {
            sections.push(
                renderOutputType(`${baseName}Output`, action.outputType, aliasToViewState),
            );
        }

        return sections.join('\n\n');
    });
}
