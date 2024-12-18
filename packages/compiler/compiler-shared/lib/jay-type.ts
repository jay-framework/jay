export interface JayType {
    name: string;
}

export class JayAtomicType implements JayType {
    constructor(public readonly name: string) {}
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
}

export class JayEnumType implements JayType {
    constructor(
        public readonly name: string,
        public readonly values: Array<string>,
    ) {}
}

export class JayHTMLType implements JayType {
    constructor(public readonly name: string) {}
}

export class JayImportedType implements JayType {
    constructor(
        public readonly name: string,
        public readonly type: JayType,
    ) {}
}

export class JayElementType implements JayType {
    constructor(public readonly name: string) {}
}

export class JayElementConstructorType implements JayType {
    constructor(
        public readonly name: string,
        public readonly typeName: string,
    ) {}
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
}

export class JayObjectType implements JayType {
    constructor(
        public readonly name: string,
        public readonly props: { [key: string]: JayType },
    ) {}
}

export class JayArrayType implements JayType {
    constructor(public readonly itemType: JayType) {}

    get name() {
        return `Array<${this.itemType.name}>`;
    }
}

export class JayUnionType implements JayType {
    constructor(public readonly ofTypes: JayType[]) {}

    get name() {
        return this.ofTypes.map((_) => _.name).join(' | ');
    }

    hasType(aType: JayType) {
        return !!this.ofTypes.find((bType) => equalJayTypes(aType, bType));
    }
}

export function equalJayTypes(a: JayType, b: JayType) {
    if (a.name !== b.name) return false;
    if (a instanceof JayAtomicType && b instanceof JayAtomicType) return true;
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
    } else false;
}
