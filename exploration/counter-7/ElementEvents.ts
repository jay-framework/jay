export class ElementEvents {
    onclick(callback: () => void): ElementEvents {
        return this;
    }
}

export function events(): ElementEvents {
    return new ElementEvents();
}
