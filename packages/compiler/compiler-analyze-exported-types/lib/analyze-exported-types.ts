import fs from 'fs';
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
const {
    isCallExpression,
    isFunctionDeclaration,
    isIdentifier,
    SyntaxKind,
    isStringLiteral,
    isQualifiedName,
    isTypeReferenceNode,
    isPropertySignature,
    convertCompilerOptionsFromJson,
    createProgram,
    isImportDeclaration,
    isInterfaceDeclaration,
    isNamedImports,
    isTypeAliasDeclaration,
    isVariableStatement,
    parseConfigFileTextToJson,
} = tsBridge;
import { resolveTsConfig, ResolveTsConfigOptions } from './resolve-ts-config';
import {
    JAY_COMPONENT,
    JAY_FULLSTACK_COMPONENTS,
    JayArrayType,
    JayComponentApiMember,
    JayComponentType,
    JayElementConstructorType,
    JayElementType,
    JayObjectType,
    JayType,
    JayUnknown,
    MAKE_JAY_COMPONENT,
    MAKE_JAY_STACK_COMPONENT,
    resolvePrimitiveType,
} from '@jay-framework/compiler-shared';
export * from './resolve-ts-config';

function getTypeName(typeName: ts.Identifier | ts.QualifiedName): string {
    if (isIdentifier(typeName)) return typeName.text;
    else if (isQualifiedName(typeName))
        return `${getTypeName(typeName.left)}.${typeName.right.text}`;
    return '';
}

function getJayType(typeNode: ts.TypeNode, types: JayType[]): JayType {
    let propType = resolvePrimitiveType(typeNode.getText());
    if (propType === JayUnknown && isTypeReferenceNode(typeNode)) {
        const typeName = getTypeName(typeNode.typeName);
        if (typeName === 'Array' && typeNode.typeArguments.length > 0)
            propType = new JayArrayType(getJayType(typeNode.typeArguments[0], types));
        else propType = types.find((_) => _.name === getTypeName(typeNode.typeName)) ?? JayUnknown;
    }
    return propType;
}

function getInterfaceJayType(
    interfaceDeclaration: ts.InterfaceDeclaration,
    types: JayType[],
): JayObjectType {
    let props = {};
    const jayObjectType = new JayObjectType(interfaceDeclaration.name.text, props);
    interfaceDeclaration.members
        .filter((member) => isPropertySignature(member) && isIdentifier(member.name))
        .forEach((member) => {
            let property = member as ts.PropertySignature;
            let name = member.name as ts.Identifier;
            let propKey = name.text;
            props[propKey] = getJayType(property.type, [...types, jayObjectType]);
        });

    return jayObjectType;
}

function getElementConstructorType(name: string, typeName: string): JayElementConstructorType {
    return new JayElementConstructorType(name, typeName);
}

function getComponentType(
    tsTypeChecker: ts.TypeChecker,
    name: string,
    componentType: ts.Type,
): JayComponentType {
    let properties = componentType.getProperties();
    let componentAPIs: Array<JayComponentApiMember> = [];
    for (let property of properties) {
        let type = tsTypeChecker.getTypeAtLocation(property.getDeclarations()[0]);
        if (JayComponentProperties[property.getName()]) {
            // JayComponent property, ignore it
        } else {
            if (type.getSymbol().getName() === 'EventEmitter')
                componentAPIs.push(new JayComponentApiMember(property.getName(), true));
            else componentAPIs.push(new JayComponentApiMember(property.getName(), false));
        }
    }

    return new JayComponentType(name, componentAPIs);
}

function autoAddExtension(filename: string) {
    if (fs.existsSync(filename + '.ts')) return filename + '.ts';
    else if (fs.existsSync(filename + '.tsx')) return filename + '.tsx';
    else if (fs.existsSync(filename + '.d.ts')) return filename + '.d.ts';
    else if (fs.existsSync(filename) && fs.statSync(filename).isDirectory())
        throw new Error(
            `"${filename}" is a directory. The src attribute must point to the component file, e.g. "${filename}/${filename.split('/').pop()}"`,
        );
    else if (fs.existsSync(filename)) return filename;
    else throw new Error(`File not found. Tried ${filename}, ${filename}.ts and ${filename}.d.ts`);
}

function isOrSubclassOf(type: ts.Type, ofClass: string): boolean {
    if (type.symbol?.name === ofClass) return true;

    for (let baseType of type.getBaseTypes() || [])
        if (baseType.symbol?.name === ofClass) return true;

    return false;
}

const JayComponentProperties = {
    element: true,
    update: true,
    mount: true,
    unmount: true,
    addEventListener: true,
    removeEventListener: true,
    viewState: true,
};

function loadTSCompilerOptions(options: ResolveTsConfigOptions = {}) {
    let tsConfigPath = resolveTsConfig(options);
    let loadedTSConfig = fs.readFileSync(tsConfigPath, 'utf8');
    let tsConfig = parseConfigFileTextToJson('tsconfig.json', loadedTSConfig);
    return convertCompilerOptionsFromJson(tsConfig.config.compilerOptions, tsConfigPath).options;
}

function findRootCallIdentifier(node: ts.CallExpression): ts.Identifier | undefined {
    let expr: ts.Node = node.expression;
    while (expr) {
        if (isIdentifier(expr)) return expr;
        if (isCallExpression(expr)) {
            expr = expr.expression;
        } else if ('expression' in expr) {
            expr = (expr as any).expression;
        } else {
            return undefined;
        }
    }
    return undefined;
}

function isExportedStatement(statement: ts.Statement) {
    return Boolean(
        (statement as any).modifiers &&
            ((statement as any).modifiers as ts.NodeArray<ts.Modifier>).find(
                (_) => _.kind === SyntaxKind.ExportKeyword,
            ),
    );
}

interface ImportedSymbol {
    module: string;
    namedImport: string;
    symbol?: ts.Symbol;
}
const SYMBOLS: Record<string, ImportedSymbol> = {
    MAKE_JAY_COMPONENT: { module: JAY_COMPONENT, namedImport: MAKE_JAY_COMPONENT },
    MAKE_JAY_STACK_COMPONENT: {
        module: JAY_FULLSTACK_COMPONENTS,
        namedImport: MAKE_JAY_STACK_COMPONENT,
    },
};

function findImportedSymbol(module: string, namedImport: string): ImportedSymbol {
    return Object.values(SYMBOLS).find(
        (importedSymbol) =>
            importedSymbol.module === module && importedSymbol.namedImport == namedImport,
    );
}

function mapImportedSymbols(statements: ts.NodeArray<ts.Statement>, tsTypeChecker: ts.TypeChecker) {
    statements.filter(isImportDeclaration).forEach((importDeclaration) => {
        if (
            isStringLiteral(importDeclaration.moduleSpecifier) &&
            importDeclaration.importClause?.namedBindings
        ) {
            const module = importDeclaration.moduleSpecifier.text;
            if (isNamedImports(importDeclaration.importClause.namedBindings)) {
                importDeclaration.importClause.namedBindings.elements.forEach((namedImport) => {
                    const name = namedImport.name.text;
                    const importedSymbol = findImportedSymbol(module, name);
                    if (importedSymbol)
                        importedSymbol.symbol = tsTypeChecker.getTypeAtLocation(namedImport).symbol;
                });
            }
        }
    });
    return SYMBOLS;
}

export function analyzeExportedTypes(
    filename: string,
    options: ResolveTsConfigOptions = {},
): JayType[] {
    // let tsConfigPath = resolveTsConfig(options);
    let compilerOptions = loadTSCompilerOptions(options);

    filename = autoAddExtension(filename);
    const program = createProgram([filename], compilerOptions);
    const sourceFile = program.getSourceFile(filename);
    const tsTypeChecker = program.getTypeChecker();

    const types = [];

    const { MAKE_JAY_COMPONENT, MAKE_JAY_STACK_COMPONENT } = mapImportedSymbols(
        sourceFile.statements,
        tsTypeChecker,
    );

    for (const statement of sourceFile.statements.filter(isExportedStatement)) {
        if (isInterfaceDeclaration(statement)) {
            types.push(getInterfaceJayType(statement, types));
        } else if (isFunctionDeclaration(statement)) {
            const functionType = tsTypeChecker.getTypeAtLocation(statement.type);
            if (functionType.symbol || functionType.aliasSymbol) {
                const typeName = functionType.symbol?.name;
                const functionName = statement?.name.text;
                const aliasName = functionType.aliasSymbol
                    ? functionType.aliasSymbol.name
                    : typeName;
                if (functionName && isOrSubclassOf(functionType, 'JayElement')) {
                    types.push(getElementConstructorType(functionName, aliasName));
                } else if (isOrSubclassOf(functionType, 'JayComponent')) {
                    // function = (props) => ComponentType
                    types.push(getComponentType(tsTypeChecker, functionName, functionType));
                } else types.push(JayUnknown);
            }
        } else if (isTypeAliasDeclaration(statement)) {
            // todo support also EntityName = QualifiedName;
            // todo change to binding resolver explain type to validate the name is actually imported from the right module
            if (
                isTypeReferenceNode(statement.type) &&
                isIdentifier(statement.type.typeName) &&
                statement.type.typeName.text === 'JayElement'
            )
                types.push(new JayElementType(statement.name.text));
        } else if (isVariableStatement(statement)) {
            statement.declarationList.declarations.forEach((declaration) => {
                if (isCallExpression(declaration.initializer) && isIdentifier(declaration.name)) {
                    const name = declaration.name.text;

                    // Check for makeJayComponent(render, fn)
                    const functionType = tsTypeChecker.getTypeAtLocation(
                        declaration.initializer.expression,
                    );
                    if (
                        MAKE_JAY_COMPONENT.symbol &&
                        functionType.symbol === MAKE_JAY_COMPONENT.symbol
                    ) {
                        const callMakeJayComponentSignature = tsTypeChecker.getResolvedSignature(
                            declaration.initializer,
                        );
                        const componentConstructorSignature = callMakeJayComponentSignature
                            .getReturnType()
                            .getCallSignatures();
                        let componentType = componentConstructorSignature[0].getReturnType();

                        types.push(getComponentType(tsTypeChecker, name, componentType));
                        return;
                    }

                    // Check for makeJayStackComponent() builder chains
                    if (MAKE_JAY_STACK_COMPONENT.symbol) {
                        const rootIdentifier = findRootCallIdentifier(declaration.initializer);
                        if (rootIdentifier) {
                            const rootType = tsTypeChecker.getTypeAtLocation(rootIdentifier);
                            if (rootType.symbol === MAKE_JAY_STACK_COMPONENT.symbol) {
                                types.push(new JayComponentType(name, [], true));
                                return;
                            }
                        }
                    }
                }
            });
        } else types.push(JayUnknown);
    }
    return types;
}
