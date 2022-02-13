import {
    FunctionDeclaration,
    InterfaceDeclaration,
    Project,
    PropertySignature,
    Type,
    TypeAliasDeclaration, VariableDeclaration
} from "ts-morph";
import * as ts from "typescript";
import fs from 'fs';
import path from "path";
import {
    JayArrayType,
    JayComponentType,
    JayElementType,
    JayObjectType,
    JayType,
    JayUnknown,
    resolvePrimitiveType
} from "./parse-jay-file";

function resolveTsConfig(options) {

    const tsConfigPath = path.resolve(process.cwd(), options.relativePath || 'tsconfig.json');
    if (!ts.sys.fileExists(tsConfigPath)) {
        if (options.relativePath) {
            // If an explicit path was provided but no file was found, throw
            throw new Error(`Could not find specified tsconfig.json at ${tsConfigPath}`);
        } else {
            return null;
        }
    }
    return tsConfigPath;
}

function getJayType(type: Type, types: JayType[]): JayType {
    let propType = resolvePrimitiveType(type.getText());
    if (propType === JayUnknown)
        propType = types.find(_ => _.name === type.getSymbol().getName()) ?? JayUnknown;
    if (propType === JayUnknown && type.getSymbol().getName() === 'Array') {
        propType = new JayArrayType(getJayType(type.getArrayElementType(), types))
    }
    return propType;
}

function getInterfaceJayType(name: string, interfaceDeclaration: InterfaceDeclaration, types: JayType[]): JayObjectType {
    let props = interfaceDeclaration.getMembers()
        .filter(member => member instanceof PropertySignature)
        .map(member => {
            let propKey = (member as PropertySignature).getName();
            let propType = getJayType(member.getType(), types)
            return {propKey, propType}
        })
        .reduce((acc, {propKey, propType}) => (acc[propKey] = propType, acc), {})

    return new JayObjectType(name, props);
}

function getElementType(name: string, functionDeclaration: FunctionDeclaration): JayElementType {
    return new JayElementType(name);
}

function getComponentType(name: string, functionDeclaration: FunctionDeclaration): JayElementType {
    return new JayComponentType(name);
}

export interface ExportedType {
    name: string;
    type: JayType;
}

function autoAddExtension(filename: string) {
    if (fs.existsSync(filename))
        return filename;
    else if (fs.existsSync(filename + '.ts'))
        return filename + '.ts';
    else if (fs.existsSync(filename + '.d.ts'))
        return filename + '.d.ts';
    else
        throw new Error(`File not found. Tried ${filename}, ${filename}.ts and ${filename}.d.ts`);
}

export function extractTypesForFile(filename: string, options = {}): JayType[] {
    let tsConfigPath = resolveTsConfig(options);
    const project = new Project({
        tsConfigFilePath: tsConfigPath,
        skipFileDependencyResolution: true
    });

    filename = autoAddExtension(filename);
    project.addSourceFileAtPath(filename);

    const mainFile = project.getSourceFileOrThrow(filename);
    const types = [];

    for (const [name, declarations] of mainFile.getExportedDeclarations()) {
        if (declarations[0] instanceof InterfaceDeclaration) {
            types.push(getInterfaceJayType(name, declarations[0], types));
        }
        else if (declarations[0] instanceof FunctionDeclaration) {
            if (declarations[0].getReturnType().getSymbol().getName() === 'JayElement') {
                types.push(getElementType(name, declarations[0]));
            }
            else if (declarations[0].getReturnType().getSymbol().getName() === 'JayComponent') {
                types.push(getComponentType(name, declarations[0]));
            }
            else
                types.push(JayUnknown)
        }
        else if (declarations[0] instanceof TypeAliasDeclaration) {
            // @ts-ignore
            if (declarations[0].compilerNode.type?.typeName?.escapedText === 'JayElement')
                types.push(new JayElementType(name));
        }
        else if (declarations[0] instanceof VariableDeclaration) {
            if (declarations[0].getChildren().length === 3 && declarations[0].getChildren()[2].getText().indexOf('makeJayComponent') === 0)
                types.push(new JayComponentType(name));
        }
        else
            types.push(JayUnknown)

    }
    return types;
}