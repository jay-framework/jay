
export const PRINCIPAL = Symbol('principal')
export function refsRecorder<Refs extends object>(): Refs {
    let principal = {};
    return new Proxy(principal, {
        set: function(obj, prop, value) {
            if (prop === PRINCIPAL)
                principal = value;
            else
                obj[prop] = value;
            return true;
        },
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
        set: function(obj, prop, value) {
            if (prop === PRINCIPAL)
                principal = value;
            else
                obj[prop] = value;
            return true;
        },
        get: function(x, prop) {
            if (prop === PRINCIPAL)
                return principal;
            if (!principal[prop])
                principal[prop] = {};
            return principal[prop]
        }
    });
}

const noopWrapper = (func: any) => func;
export function applyToRefs<Refs, Fn>(proxy: Refs, refs: Refs, wrapper: (func: Fn) => Fn = noopWrapper) {
    let refsPrincipal = proxy[PRINCIPAL];
    for (let key in refsPrincipal) {
        let refPrincipal = refsPrincipal[key][PRINCIPAL];
        for (let event in refPrincipal) {
            refs[key][event] = wrapper(refPrincipal[event]);
        }
        refsPrincipal[key][PRINCIPAL] = refs[key];
    }
    proxy[PRINCIPAL] = refs;
}