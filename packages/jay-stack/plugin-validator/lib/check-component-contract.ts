/**
 * Component-contract consistency checker (Design Log #124, Phase 3).
 *
 * Single-file AST analysis: detects .withProps<T>() and .withLoadParams(fn)
 * in a component's TypeScript source, then compares the type's properties
 * against the contract's props/params declarations.
 *
 * Uses @jay-framework/typescript-bridge for AST parsing — same approach as
 * source-file-binding-resolver.ts in the compiler package.
 */

import { ts } from '@jay-framework/typescript-bridge';
import type { TypeScript } from '@jay-framework/typescript-bridge';
import type { ValidationError, ValidationWarning } from './types';

// Framework types that are NOT component-specific props
const FRAMEWORK_PROP_TYPES = new Set(['PageProps', 'RequestQuery']);

// Base type for params — properties from it are inherited, not user-defined
const PARAMS_BASE_TYPE = 'UrlParams';

export interface ContractPropsAndParams {
    props?: Array<{ name: string; required?: boolean }>;
    params?: Array<{ name: string }>;
}

export interface CheckResult {
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

/**
 * Check that a component's .withProps<T>() and .withLoadParams(fn) usage
 * is consistent with its contract's props/params declarations.
 *
 * @param sourceCode - The component's TypeScript source code
 * @param contract - The parsed contract (props/params from the .jay-contract file)
 * @param contractName - The contract name (without .jay-contract suffix), used in error messages
 * @param contractPath - Path to the contract file (for error location)
 * @param sourcePath - Path to the component source (for error location)
 */
export function checkComponentPropsAndParams(
    sourceCode: string,
    contract: ContractPropsAndParams,
    contractName: string,
    contractPath: string,
    sourcePath: string,
): CheckResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const sourceFile = ts.createSourceFile(
        sourcePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    // 1. Collect locally-defined interfaces and their properties
    const localInterfaces = collectLocalInterfaces(sourceFile);

    // 2. Collect import sources to know which types come from the contract
    const contractImportedTypes = collectContractImportedTypes(sourceFile);

    // 3. Find builder chain analysis
    const builderInfo = analyzeBuilderChains(sourceFile);

    // 4. Check props
    for (const propsTypeName of builderInfo.propsTypeNames) {
        checkPropsConsistency(
            propsTypeName,
            localInterfaces,
            contractImportedTypes,
            contract,
            contractName,
            contractPath,
            sourcePath,
            errors,
            warnings,
        );
    }

    // 5. Check params
    if (builderInfo.hasLoadParams) {
        checkParamsConsistency(
            builderInfo.paramsTypeNames,
            localInterfaces,
            contractImportedTypes,
            contract,
            contractName,
            contractPath,
            sourcePath,
            errors,
            warnings,
        );
    }

    return { errors, warnings };
}

// ============================================================================
// Interface collection
// ============================================================================

interface InterfaceInfo {
    name: string;
    properties: string[];
    extendsTypes: string[];
}

/** Collect all interface declarations in the file with their property names. */
function collectLocalInterfaces(sourceFile: TypeScript.SourceFile): Map<string, InterfaceInfo> {
    const interfaces = new Map<string, InterfaceInfo>();

    for (const statement of sourceFile.statements) {
        if (ts.isInterfaceDeclaration(statement)) {
            const name = statement.name.text;
            const properties: string[] = [];
            for (const member of statement.members) {
                if (ts.isPropertySignature(member) && member.name) {
                    if (ts.isIdentifier(member.name)) {
                        properties.push(member.name.text);
                    } else if (ts.isStringLiteral(member.name)) {
                        properties.push(member.name.text);
                    }
                }
            }
            const extendsTypes: string[] = [];
            if (statement.heritageClauses) {
                for (const clause of statement.heritageClauses) {
                    for (const type of clause.types) {
                        if (ts.isIdentifier(type.expression)) {
                            extendsTypes.push(type.expression.text);
                        }
                    }
                }
            }
            interfaces.set(name, { name, properties, extendsTypes });
        }

        // Also handle type aliases with object literal types
        if (ts.isTypeAliasDeclaration(statement)) {
            const name = statement.name.text;
            if (ts.isTypeLiteralNode(statement.type)) {
                const properties: string[] = [];
                for (const member of statement.type.members) {
                    if (ts.isPropertySignature(member) && member.name) {
                        if (ts.isIdentifier(member.name)) {
                            properties.push(member.name.text);
                        }
                    }
                }
                interfaces.set(name, { name, properties, extendsTypes: [] });
            }
        }
    }

    return interfaces;
}

// ============================================================================
// Import analysis
// ============================================================================

/** Collect type names imported from .jay-contract files. */
function collectContractImportedTypes(sourceFile: TypeScript.SourceFile): Set<string> {
    const contractTypes = new Set<string>();

    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)) continue;

        const moduleSpecifier = statement.moduleSpecifier;
        if (!ts.isStringLiteral(moduleSpecifier)) continue;

        const modulePath = moduleSpecifier.text;
        if (!modulePath.includes('.jay-contract')) continue;

        // Collect all named imports from this contract module
        const importClause = statement.importClause;
        if (!importClause) continue;

        const namedBindings = importClause.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
            for (const element of namedBindings.elements) {
                contractTypes.add(element.name.text);
            }
        }
    }

    return contractTypes;
}

// ============================================================================
// Builder chain analysis
// ============================================================================

interface BuilderInfo {
    /** Type names from .withProps<T>() — may include intersection parts */
    propsTypeNames: string[];
    /** Whether .withLoadParams() was called */
    hasLoadParams: boolean;
    /** Type names for params (from function return type or type argument) */
    paramsTypeNames: string[];
}

/** Analyze makeJayStackComponent builder chains in the file. */
function analyzeBuilderChains(sourceFile: TypeScript.SourceFile): BuilderInfo {
    const result: BuilderInfo = {
        propsTypeNames: [],
        hasLoadParams: false,
        paramsTypeNames: [],
    };

    // Walk all nodes looking for call expressions in builder chains
    visitNode(sourceFile, result);

    return result;
}

function visitNode(node: TypeScript.Node, result: BuilderInfo): void {
    if (ts.isCallExpression(node)) {
        const expr = node.expression;

        // Check for .withProps<T>() pattern
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'withProps') {
            if (node.typeArguments && node.typeArguments.length > 0) {
                const typeNames = extractTypeNames(node.typeArguments[0]);
                result.propsTypeNames.push(...typeNames);
            }
        }

        // Check for .withLoadParams(fn) pattern
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'withLoadParams') {
            result.hasLoadParams = true;

            // Try to extract params type from the type argument if present
            if (node.typeArguments && node.typeArguments.length > 0) {
                const typeNames = extractTypeNames(node.typeArguments[0]);
                result.paramsTypeNames.push(...typeNames);
            }

            // Also try to find the params type from the function argument
            if (node.arguments.length > 0) {
                const arg = node.arguments[0];
                if (ts.isIdentifier(arg)) {
                    // Reference to a function — we'll look for its return/yield type later
                    // For now, mark that params are used
                }
            }
        }
    }

    ts.forEachChild(node, (child) => visitNode(child, result));
}

/** Extract type names from a type node, handling intersections. */
function extractTypeNames(typeNode: TypeScript.TypeNode): string[] {
    if (ts.isTypeReferenceNode(typeNode)) {
        if (ts.isIdentifier(typeNode.typeName)) {
            return [typeNode.typeName.text];
        }
    }

    if (ts.isIntersectionTypeNode(typeNode)) {
        const names: string[] = [];
        for (const member of typeNode.types) {
            names.push(...extractTypeNames(member));
        }
        return names;
    }

    return [];
}

// ============================================================================
// Props consistency check
// ============================================================================

function checkPropsConsistency(
    propsTypeName: string,
    localInterfaces: Map<string, InterfaceInfo>,
    contractImportedTypes: Set<string>,
    contract: ContractPropsAndParams,
    contractName: string,
    contractPath: string,
    sourcePath: string,
    errors: ValidationError[],
    warnings: ValidationWarning[],
): void {
    // Skip framework types
    if (FRAMEWORK_PROP_TYPES.has(propsTypeName)) return;

    // Skip types imported from the contract itself — they match by definition
    if (contractImportedTypes.has(propsTypeName)) return;

    const prefix = `[${contractName}]`;

    // Type is locally defined — compare properties against contract
    const iface = localInterfaces.get(propsTypeName);
    if (!iface) {
        // Type not found locally and not from contract — might be from another module.
        // We can still check that the contract has props at all.
        if (!contract.props || contract.props.length === 0) {
            errors.push({
                type: 'contract-invalid',
                message:
                    `${prefix} component uses .withProps<${propsTypeName}>() but the contract ` +
                    `does not declare any props`,
                location: contractPath,
                suggestion: `Add a props section to the contract`,
            });
        }
        return;
    }

    // Filter out inherited framework properties
    const ownProperties = iface.properties;
    if (ownProperties.length === 0) return;

    // Check contract has props section
    if (!contract.props || contract.props.length === 0) {
        errors.push({
            type: 'contract-invalid',
            message:
                `${prefix} component uses .withProps<${propsTypeName}>() with properties ` +
                `[${ownProperties.join(', ')}] but the contract does not declare any props`,
            location: contractPath,
            suggestion:
                `Add to contract: props:\n` +
                ownProperties.map((p) => `  - name: ${p}\n    type: string`).join('\n'),
        });
        return;
    }

    // Check each property exists in contract
    const contractPropNames = new Set(contract.props.map((p) => p.name));
    for (const prop of ownProperties) {
        if (!contractPropNames.has(prop)) {
            errors.push({
                type: 'contract-invalid',
                message:
                    `${prefix} component prop "${prop}" (from ${propsTypeName}) is not declared ` +
                    `in the contract`,
                location: contractPath,
                suggestion: `Add to contract props: - name: ${prop}`,
            });
        }
    }

    // Reverse check: contract props not in component interface
    for (const contractProp of contract.props) {
        if (!ownProperties.includes(contractProp.name)) {
            warnings.push({
                type: 'contract-invalid',
                message:
                    `${prefix} contract declares prop "${contractProp.name}" but the component's ` +
                    `${propsTypeName} interface does not include it`,
                location: sourcePath,
                suggestion:
                    `Add "${contractProp.name}" to the ${propsTypeName} interface, ` +
                    `or remove it from the contract`,
            });
        }
    }
}

// ============================================================================
// Params consistency check
// ============================================================================

function checkParamsConsistency(
    paramsTypeNames: string[],
    localInterfaces: Map<string, InterfaceInfo>,
    contractImportedTypes: Set<string>,
    contract: ContractPropsAndParams,
    contractName: string,
    contractPath: string,
    sourcePath: string,
    errors: ValidationError[],
    warnings: ValidationWarning[],
): void {
    const prefix = `[${contractName}]`;

    // Component uses .withLoadParams() — contract must have params
    if (!contract.params || contract.params.length === 0) {
        errors.push({
            type: 'contract-invalid',
            message: `${prefix} component uses .withLoadParams() but the contract does not declare any params`,
            location: contractPath,
            suggestion: `Add a params section to the contract (e.g., params: { slug: string })`,
        });

        // If we have type info, include it in the error
        for (const typeName of paramsTypeNames) {
            if (FRAMEWORK_PROP_TYPES.has(typeName)) continue;
            if (contractImportedTypes.has(typeName)) continue;

            const iface = localInterfaces.get(typeName);
            if (iface) {
                // Filter out UrlParams base properties
                const ownProps = iface.properties;
                if (ownProps.length > 0) {
                    errors[errors.length - 1].suggestion =
                        `Add to contract: params:\n` +
                        ownProps.map((p) => `  ${p}: string`).join('\n');
                }
            }
        }
        return;
    }

    // Check individual param names if we have type info
    for (const typeName of paramsTypeNames) {
        if (FRAMEWORK_PROP_TYPES.has(typeName)) continue;
        if (contractImportedTypes.has(typeName)) continue;

        const iface = localInterfaces.get(typeName);
        if (!iface) continue;

        // Get own properties (exclude UrlParams base if extends it)
        const ownProperties = iface.properties;
        const contractParamNames = new Set(contract.params.map((p) => p.name));

        for (const prop of ownProperties) {
            if (!contractParamNames.has(prop)) {
                errors.push({
                    type: 'contract-invalid',
                    message:
                        `${prefix} component param "${prop}" (from ${typeName}) is not declared ` +
                        `in the contract`,
                    location: contractPath,
                    suggestion: `Add to contract params: ${prop}: string`,
                });
            }
        }

        // Reverse check
        for (const contractParam of contract.params) {
            if (!ownProperties.includes(contractParam.name)) {
                warnings.push({
                    type: 'contract-invalid',
                    message:
                        `${prefix} contract declares param "${contractParam.name}" but the component's ` +
                        `${typeName} interface does not include it`,
                    location: sourcePath,
                    suggestion:
                        `Add "${contractParam.name}" to the ${typeName} interface, ` +
                        `or remove it from the contract`,
                });
            }
        }
    }
}

// ============================================================================
// Utility: find params interface from a loadParams function
// ============================================================================

/**
 * Try to find the params type from a loadParams function defined in the file.
 * Looks for `async function* name(...): AsyncIterable<ParamsType[]>` patterns.
 */
export function findParamsTypeFromFunction(
    sourceFile: TypeScript.SourceFile,
    functionName: string,
): string | undefined {
    for (const statement of sourceFile.statements) {
        // async function* loadProductParams(...): AsyncIterable<ProductPageParams[]>
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) {
            return extractParamsFromReturnType(statement.type);
        }

        // const loadProductParams = async function*(...): AsyncIterable<ProductPageParams[]>
        if (ts.isVariableStatement(statement)) {
            for (const decl of statement.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === functionName) {
                    if (
                        decl.initializer &&
                        (ts.isFunctionExpression(decl.initializer) ||
                            ts.isArrowFunction(decl.initializer))
                    ) {
                        return extractParamsFromReturnType(decl.initializer.type);
                    }
                }
            }
        }
    }
    return undefined;
}

function extractParamsFromReturnType(
    typeNode: TypeScript.TypeNode | undefined,
): string | undefined {
    if (!typeNode) return undefined;

    // AsyncIterable<ParamsType[]>
    if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
        if (typeNode.typeName.text === 'AsyncIterable' && typeNode.typeArguments?.length === 1) {
            const inner = typeNode.typeArguments[0];
            // ParamsType[]
            if (ts.isArrayTypeNode(inner)) {
                if (
                    ts.isTypeReferenceNode(inner.elementType) &&
                    ts.isIdentifier(inner.elementType.typeName)
                ) {
                    return inner.elementType.typeName.text;
                }
            }
        }
    }

    return undefined;
}
