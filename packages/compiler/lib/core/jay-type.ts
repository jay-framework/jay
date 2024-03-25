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
