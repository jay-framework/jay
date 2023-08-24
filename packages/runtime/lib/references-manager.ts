import {BaseJayElement, JayElement, JayEvent, JayEventHandler, JayEventHandlerWrapper} from "./element-types";

export interface ManagedRef<PublicRefAPI> {
    getPublicAPI(): PublicRefAPI;
}

function defaultEventWrapper<EventType, ViewState, Returns>(
    orig: JayEventHandler<EventType, ViewState, Returns>,
    event: JayEvent<EventType, ViewState>): Returns {
    return orig(event)
}

export class ReferencesManager {
    private refs: Record<string, ManagedRef<any>> = {};

    constructor(
        public readonly eventWrapper: JayEventHandlerWrapper<any, any, any> = defaultEventWrapper) {
    }

    add<Ref extends ManagedRef<any>>(refName: string, ref: Ref): Ref {
        return this.refs[refName] = ref;
    }

    get(refName: string): ManagedRef<any> {
        return this.refs[refName];
    }

    applyToElement<T, Refs>(element: BaseJayElement<T>): JayElement<T, Refs> {
        let enrichedDynamicRefs = Object.keys(this.refs).reduce((publicRefAPIs, key) => {
            publicRefAPIs[key] = this.refs[key].getPublicAPI();
            return publicRefAPIs;
        }, {})
        let refs = enrichedDynamicRefs as Refs
        return {...element, refs};
    }
}