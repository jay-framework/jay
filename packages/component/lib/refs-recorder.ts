
export const PRINCIPAL = Symbol('principal')
export function refsRecorder<Refs extends object>(): Refs {
    let principal = {};
    return new Proxy(principal, {
        get: function(obj, prop) {
            if (prop === PRINCIPAL)
                return principal;
            if (!principal[prop])
                principal[prop] = makeRefRecorder();
            return principal[prop]
        }
    }) as Refs;
}

function makeRefRecorder() {
    let principal = {};
    return new Proxy(principal, {
        get: function(x, prop) {
            if (prop === PRINCIPAL)
                return x;
            if (!x[prop])
                x[prop] = {};
            return x[prop]
        }
    });
}

const noopWrapper = (func: any) => func;
export function applyToRefs<Refs>(proxy: Refs, refs: Refs, wrapper: (func: any) => void = noopWrapper) {
    let refsPrincipal = proxy[PRINCIPAL];
    for (let key in refsPrincipal) {
        let refPrincipal = refsPrincipal[key][PRINCIPAL];
        for (let event in refPrincipal) {
            refs[key][event] = wrapper(refPrincipal[event]);
        }
    }
}