import fs from 'fs';

import { resolveTsConfig, ResolveTsConfigOptions } from './ts-utils/resolve-ts-config';
import {
    JayArrayType,
    JayComponentApiMember,
    JayComponentType,
    JayElementConstructorType,
    JayElementType,
    JayObjectType,
    JayType,
    JayUnknown,
    resolvePrimitiveType,
} from '../core/jay-type';
import ts, {
    convertCompilerOptionsFromJson,
    createProgram,
    Identifier,
    InterfaceDeclaration,
    isCallExpression,
    isFunctionDeclaration,
    isIdentifier,
    isInterfaceDeclaration,
    isPropertySignature,
    isQualifiedName,
    isTypeAliasDeclaration,
    isTypeReferenceNode,
    isVariableStatement,
    Modifier,
    NodeArray,
    parseConfigFileTextToJson,
    QualifiedName,
    Statement,
    SyntaxKind,
    TypeChecker,
    TypeNode,
} from 'typescript';

function getTypeName(typeName: Identifier | QualifiedName): string {
    if (isIdentifier(typeName)) return typeName.text;
    else if (isQualifiedName(typeName))
        return `${getTypeName(typeName.left)}.${typeName.right.text}`;
}

function getJayType(typeNode: TypeNode, types: JayType[]): JayType {
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
    interfaceDeclaration: InterfaceDeclaration,
    types: JayType[],
): JayObjectType {
    let props = {};
    const jayObjectType = new JayObjectType(interfaceDeclaration.name.text, props);
    interfaceDeclaration.members
        .filter((member) => isPropertySignature(member) && isIdentifier(member.name))
        .forEach((member) => {
            let property = member as ts.PropertySignature;
            let name = member.name as Identifier;
            let propKey = name.text;
            props[propKey] = getJayType(property.type, [...types, jayObjectType]);
        });

    return jayObjectType;
}

function getElementConstructorType(name: string, typeName: string): JayElementConstructorType {
    return new JayElementConstructorType(name, typeName);
}

function getComponentType(
    tsTypeChecker: TypeChecker,
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
    else if (fs.existsSync(filename + '.d.ts')) return filename + '.d.ts';
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
};

function loadTSCompilerOptions(options: ResolveTsConfigOptions = {}) {
    let tsConfigPath = resolveTsConfig(options);
    let loadedTSConfig = fs.readFileSync(tsConfigPath, 'utf8');
    let tsConfig = parseConfigFileTextToJson('tsconfig.json', loadedTSConfig);
    return convertCompilerOptionsFromJson(tsConfig.config.compilerOptions, tsConfigPath).options;
}

function isExportedStatement(statement: Statement) {
    return Boolean(
        (statement as any).modifiers &&
            ((statement as any).modifiers as NodeArray<Modifier>).find(
                (_) => _.kind === SyntaxKind.ExportKeyword,
            ),
    );
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
                    const functionType = tsTypeChecker.getTypeAtLocation(
                        declaration.initializer.expression,
                    );
                    const name = declaration.name.text;
                    if (functionType.symbol.name === 'makeJayComponent') {
                        // function = makeJayComponent => (props) => ComponentType
                        const callMakeJayComponentSignature = tsTypeChecker.getResolvedSignature(
                            declaration.initializer,
                        );
                        const componentConstructorSignature = callMakeJayComponentSignature
                            .getReturnType()
                            .getCallSignatures();
                        let componentType = componentConstructorSignature[0].getReturnType();

                        types.push(getComponentType(tsTypeChecker, name, componentType));
                    }
                }
            });
        } else types.push(JayUnknown);
    }
    return types;
}
