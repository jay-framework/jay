import {
    CallExpression,
    FunctionDeclaration,
    InterfaceDeclaration, Node,
    Project,
    PropertySignature,
    Type,
    TypeAliasDeclaration
} from "ts-morph";
import * as ts from "typescript";
import fs from 'fs';
import path from "path";
import {
    JayArrayType, JayComponentApiMember,
    JayComponentType,
    JayElementType,
    JayObjectType,
    JayType,
    JayUnknown,
    resolvePrimitiveType
} from "./jay-file-parser";

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
    let props = {};
    const jayObjectType = new JayObjectType(name, props);
    interfaceDeclaration.getMembers()
        .filter(member => member instanceof PropertySignature)
        .forEach(member => {
            let propKey = (member as PropertySignature).getName();
            let propType = getJayType(member.getType(), [...types, jayObjectType])
            props[propKey] = propType
        });

    return jayObjectType;
}

function getElementType(name: string, functionDeclaration: FunctionDeclaration): JayElementType {
    return new JayElementType(name);
}

function getComponentType(tsTypeChecker, name: string, componentType: Type): JayElementType {
    let properties = componentType.getProperties()
    let componentAPIs: Array<JayComponentApiMember> = []
    for (let property of properties) {
        let type = tsTypeChecker.getTypeAtLocation(property.compilerSymbol.getDeclarations()[0])
        if (JayComponentProperties[property.getName()]) {
            // JayComponent property, ignore it
        }
        else {
            if (type.getSymbol().getName() === 'EventEmitter')
                componentAPIs.push(new JayComponentApiMember(property.getName(), true))
            else
                componentAPIs.push(new JayComponentApiMember(property.getName(), false))
        }
    }


    return new JayComponentType(name, componentAPIs);
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

function isOrSubclassOf(type: Type, ofClass: string): boolean {
    if (type.getSymbol().getName() === ofClass)
        return true;

    for (let baseType of type.getBaseTypes())
        if (baseType.getSymbol().getName() === ofClass)
            return true;

    return false;
}

const JayComponentProperties = {
    element: true,
    update: true,
    mount: true,
    unmount: true,
    addEventListener: true,
    removeEventListener: true
}
export function tsExtractTypes(filename: string, options = {}): JayType[] {
    let tsConfigPath = resolveTsConfig(options);
    const project = new Project({
        tsConfigFilePath: tsConfigPath,
        skipFileDependencyResolution: true
    });

    filename = autoAddExtension(filename);
    project.addSourceFileAtPath(filename);
    let tsTypeChecker = project.getTypeChecker().compilerObject;

    const mainFile = project.getSourceFileOrThrow(filename);
    //
    const types = [];

    for (const [name, declarations] of mainFile.getExportedDeclarations()) {
        // console.log(project.getTypeChecker().getPropertiesOfType(declarations[0].getType()))
        if (declarations[0] instanceof InterfaceDeclaration) {
            types.push(getInterfaceJayType(name, declarations[0], types));
        }
        else if (declarations[0] instanceof FunctionDeclaration) {
            // console.log(declarations[0].getName(), ' ==> ', project.getTypeChecker().getPropertiesOfType(declarations[0].getReturnType()).map(_ => _.getName()))
            if (isOrSubclassOf(declarations[0].getReturnType(), 'JayElement')) {
                types.push(getElementType(name, declarations[0]));
            }
            else if (isOrSubclassOf(declarations[0].getReturnType(), 'JayComponent')) {
                types.push(getComponentType(tsTypeChecker, name, declarations[0].getReturnType()));
            }
            else
                types.push(JayUnknown)
        }
        else if (declarations[0] instanceof TypeAliasDeclaration) {
            // @ts-ignore
            if (declarations[0].compilerNode.type?.typeName?.escapedText === 'JayElement')
                types.push(new JayElementType(name));
        }
        else if (Node.isVariableDeclaration(declarations[0])) {
            if (declarations[0].getChildren().length === 3 && declarations[0].getChildren()[2].getText().indexOf('makeJayComponent') === 0) {
                types.push(getComponentType(tsTypeChecker, name, (declarations[0].getChildren()[2] as CallExpression).getReturnType().getCallSignatures()[0].getReturnType()))
                // types.push(new JayComponentType(name, componentAPIs));
            }
        }
        else
            types.push(JayUnknown)

    }
    return types;
}