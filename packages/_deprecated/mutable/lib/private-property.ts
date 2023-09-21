export function setPrivateProperty<T extends object>(
    object: T,
    property: string | symbol,
    value: any,
): T {
    if (!Object.getOwnPropertyDescriptor(object, property))
        Object.defineProperty(object, property, {
            value: value,
            enumerable: false,
            configurable: true,
            writable: true,
        });
    else object[property] = value;
    return object;
}
