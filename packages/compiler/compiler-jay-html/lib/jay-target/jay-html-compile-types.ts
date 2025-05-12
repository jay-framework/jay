import {
    isArrayType,
    isAtomicType,
    isEnumType,
    isObjectType,
    JayImportedType,
    JayType,
} from 'jay-compiler-shared';

function renderInterface(aType: JayType): string {
    let childInterfaces = [];

    let genInterface = '';
    if (isObjectType(aType)) {
        const propKeys = Object.keys(aType.props);
        if (propKeys.length === 0) genInterface = `export interface ${aType.name} {}`;
        else {
            genInterface = `export interface ${aType.name} {\n`;
            genInterface += Object.keys(aType.props)
                .map((prop) => {
                    let childType = aType.props[prop];
                    if (childType instanceof JayImportedType) {
                        return `  ${prop}: ${childType.name}`;
                    } else if (isObjectType(childType)) {
                        childInterfaces.push(renderInterface(childType));
                        return `  ${prop}: ${childType.name}`;
                    } else if (isArrayType(childType)) {
                        let arrayItemType = childType.itemType;
                        if (isObjectType(arrayItemType)) {
                            childInterfaces.push(renderInterface(arrayItemType));
                            return `  ${prop}: Array<${arrayItemType.name}>`;
                        }
                        if (arrayItemType instanceof JayImportedType) {
                            return `  ${prop}: Array<${arrayItemType.name}>`;
                        } else {
                            throw new Error('not implemented yet');
                            // todo implement array of array or array of primitive
                        }
                    } else if (isAtomicType(childType)) return `  ${prop}: ${childType.name}`;
                    else if (isEnumType(childType)) {
                        let genEnum = `export enum ${childType.name} {\n${childType.values
                            .map((_) => '  ' + _)
                            .join(',\n')}\n}`;
                        childInterfaces.push(genEnum);
                        return `  ${prop}: ${childType.name}`;
                    } else throw new Error(`unknown type ${childType.name}, ${childType.kind}`);
                })
                .join(',\n');
            genInterface += '\n}';
        }
    }
    return [...childInterfaces, genInterface].join('\n\n');
}

export function generateTypes(types: JayType): string {
    return renderInterface(types);
}
