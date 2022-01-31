

let stored_vs;
export function setViewState(vs: object) {
    stored_vs = vs;
}

export function getViewState(): object {
    return stored_vs;
}