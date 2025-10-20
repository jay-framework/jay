export enum JayTypeKind {
    atomic,
    typeAlias,
    enum,
    html,
    imported,
    element,
    elementConstructor,
    component,
    object,
    array,
    union,
    promise,
    recursive,
}
export interface JayType {
    name: string;
    readonly kind: JayTypeKind;
}

export class JayAtomicType implements JayType {
    constructor(public readonly name: string) {}
    readonly kind = JayTypeKind.atomic;
}

export const JayString = new JayAtomicType('string');
export const JayNumber = new JayAtomicType('number');
export const JayBoolean = new JayAtomicType('boolean');
export const JayDate = new JayAtomicType('Date');
export const JayUnknown = new JayAtomicType('Unknown');

const typesMap = {
    string: JayString,
    number: JayNumber,
    boolean: JayBoolean,
    date: JayDate,
};

export function resolvePrimitiveType(typeName: string): JayType {
    return typesMap[typeName] || JayUnknown;
}

export class JayTypeAlias implements JayType {
    constructor(public readonly name: string) {}
    readonly kind = JayTypeKind.typeAlias;
}

export class JayEnumType implements JayType {
    constructor(
        public readonly name: string,
        public readonly values: Array<string>,
    ) {}
    readonly kind = JayTypeKind.enum;
}

export class JayHTMLType implements JayType {
    constructor(public readonly name: string) {}
    readonly kind = JayTypeKind.html;
}

export class JayImportedType implements JayType {
    constructor(
        public readonly name: string,
        public readonly type: JayType,
    ) {}
    readonly kind = JayTypeKind.imported;
}

export class JayElementType implements JayType {
    constructor(public readonly name: string) {}
    readonly kind = JayTypeKind.element;
}

export class JayElementConstructorType implements JayType {
    constructor(
        public readonly name: string,
        public readonly typeName: string,
    ) {}
    readonly kind = JayTypeKind.elementConstructor;
}

export class JayComponentApiMember {
    constructor(
        public readonly property: string,
        public readonly isEvent: boolean,
    ) {}
}

export class JayComponentType implements JayType {
    constructor(
        public readonly name: string,
        public readonly api: Array<JayComponentApiMember>,
    ) {}
    readonly kind = JayTypeKind.component;
}

export class JayObjectType implements JayType {
    constructor(
        public readonly name: string,
        public readonly props: { [key: string]: JayType },
    ) {}
    readonly kind = JayTypeKind.object;
}

export class JayArrayType implements JayType {
    constructor(public readonly itemType: JayType) {}

    get name() {
        return `Array<${this.itemType.name}>`;
    }
    readonly kind = JayTypeKind.array;
}

export class JayUnionType implements JayType {
    constructor(public readonly ofTypes: JayType[]) {}
    readonly kind = JayTypeKind.union;

    get name() {
        return this.ofTypes.map((_) => _.name).join(' | ');
    }

    hasType(aType: JayType) {
        return !!this.ofTypes.find((bType) => equalJayTypes(aType, bType));
    }
}

export class JayPromiseType implements JayType {
    constructor(public readonly itemType: JayType) {}
    readonly kind = JayTypeKind.promise;

    get name() {
        return `Promise<${this.itemType.name}>`;
    }
}

export class JayRecursiveType implements JayType {
    constructor(
        public readonly referencePath: string,
        public resolvedType?: JayType,
    ) {}
    readonly kind = JayTypeKind.recursive;

    get name() {
        return this.resolvedType?.name || `Recursive<${this.referencePath}>`;
    }
}

export const JayErrorType = new JayObjectType('Error', {
    message: new JayAtomicType('string'),
    name: new JayAtomicType('string'),
    stack: new JayAtomicType('string'),
});

export function isAtomicType(aType: JayType): aType is JayAtomicType {
    return aType.kind === JayTypeKind.atomic;
}
export function isTypeAliasType(aType: JayType): aType is JayTypeAlias {
    return aType.kind === JayTypeKind.typeAlias;
}
export function isEnumType(aType: JayType): aType is JayEnumType {
    return aType.kind === JayTypeKind.enum;
}
export function isHTMLType(aType: JayType): aType is JayHTMLType {
    return aType.kind === JayTypeKind.html;
}
export function isImportedType(aType: JayType): aType is JayImportedType {
    return aType.kind === JayTypeKind.imported;
}
export function isElementConstructorType(aType: JayType): aType is JayElementConstructorType {
    return aType.kind === JayTypeKind.elementConstructor;
}
export function isElementType(aType: JayType): aType is JayElementType {
    return aType.kind === JayTypeKind.element;
}
export function isComponentType(aType: JayType): aType is JayComponentType {
    return aType.kind === JayTypeKind.component;
}
export function isObjectType(aType: JayType): aType is JayObjectType {
    return aType.kind === JayTypeKind.object;
}
export function isArrayType(aType: JayType): aType is JayArrayType {
    return aType.kind === JayTypeKind.array;
}
export function isUnionType(aType: JayType): aType is JayUnionType {
    return aType.kind === JayTypeKind.union;
}

export function isPromiseType(aType: JayType): aType is JayPromiseType {
    return aType.kind === JayTypeKind.promise;
}

export function isRecursiveType(aType: JayType): aType is JayRecursiveType {
    return aType.kind === JayTypeKind.recursive;
}

export function isCurrencyType(aType: JayType): aType is JayAtomicType {
    return aType.kind === JayTypeKind.atomic && aType.name === 'Currency';
}

export function isDateWithTimezoneType(aType: JayType): aType is JayAtomicType {
    return aType.kind === JayTypeKind.atomic && aType.name === 'DateWithTimezone';
}

export function equalJayTypes(a: JayType, b: JayType) {
    if (a.name !== b.name) return false;
    if (a instanceof JayAtomicType && b instanceof JayAtomicType) return a.name === b.name;
    else if (a instanceof JayEnumType && b instanceof JayEnumType)
        return (
            a.values.length === b.values.length &&
            a.values.reduce(
                (res, a_val, currentIndex) => res && a_val === b.values[currentIndex],
                true,
            )
        );
    else if (a instanceof JayArrayType && b instanceof JayArrayType)
        return equalJayTypes(a.itemType, b.itemType);
    else if (a instanceof JayTypeAlias && b instanceof JayTypeAlias) return true;
    else if (a instanceof JayHTMLType && b instanceof JayHTMLType) return true;
    else if (a instanceof JayImportedType && b instanceof JayImportedType)
        return equalJayTypes(a.type, b.type);
    else if (a instanceof JayElementType && b instanceof JayElementType) return true;
    else if (a instanceof JayElementConstructorType && b instanceof JayElementConstructorType)
        return a.typeName === b.typeName;
    else if (a instanceof JayComponentType && b instanceof JayComponentType)
        return (
            a.api.length === b.api.length &&
            a.api.reduce(
                (res, a_val, currentIndex) =>
                    res &&
                    a_val.property === b.api[currentIndex].property &&
                    a_val.isEvent === b.api[currentIndex].isEvent,
                true,
            )
        );
    else if (a instanceof JayObjectType && b instanceof JayObjectType) {
        const aProps = new Set(Object.keys(a.props));
        const bProps = new Set(Object.keys(b.props));
        return (
            aProps.size === bProps.size &&
            [...aProps].map((aProp) => bProps.has(aProp) && equalJayTypes(a[aProp], b[aProp]))
        );
    } else if (a instanceof JayUnionType && b instanceof JayUnionType) {
        return (
            a.ofTypes.length === b.ofTypes.length &&
            a.ofTypes.reduce((res, aType) => res && b.hasType(aType), true)
        );
    } else if (a instanceof JayPromiseType && b instanceof JayPromiseType) {
        return equalJayTypes(a.itemType, b.itemType);
    } else if (a instanceof JayRecursiveType && b instanceof JayRecursiveType) {
        return a.referencePath === b.referencePath;
    } else false;
}
