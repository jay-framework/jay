import {
    BaseJayElement, Coordinate,
    JayElement,
    JayEvent,
    JayEventHandler,
    JayEventHandlerWrapper, RenderElementOptions,
} from './element-types';
import {
    ComponentCollectionRefImpl, ComponentRefsImpl,
    HTMLElementCollectionRefImpl,
    HTMLElementRefsImpl,
    PrivateRef
} from "./node-reference.ts";
import {currentConstructionContext} from "./context.ts";

export interface ManagedRefs{
    getPublicAPI(): any;

    mkManagedRef(currData: any, strings: Coordinate, eventWrapper: JayEventHandlerWrapper<any, any, any>):
        any;
}

function defaultEventWrapper<EventType, ViewState, Returns>(
    orig: JayEventHandler<EventType, ViewState, Returns>,
    event: JayEvent<EventType, ViewState>,
): Returns {
    return orig(event);
}

type ManagedRefConstructor = () => ManagedRefs
const ManagedRefsConstructors: ManagedRefConstructor[] = [
    () => new HTMLElementRefsImpl(),
    () => new HTMLElementCollectionRefImpl(),
    () => new ComponentRefsImpl(),
    () => new ComponentCollectionRefImpl()];
type PrivateRefConstructor<ViewState> = () => PrivateRef<ViewState, any>;

export class ReferencesManager {
    private refs: Record<string, ManagedRefs> = {};

    constructor(
        public readonly eventWrapper: JayEventHandlerWrapper<any, any, any> = defaultEventWrapper,
    ) {}

    mkRefs<ViewState>(elem: string[], elemCollection: string[], comp: string[], compCollection: string[]):
        PrivateRefConstructor<ViewState>[] {
        const mkPrivateRefs: PrivateRefConstructor<ViewState>[] = []
        const names: string[][] = [elem, elemCollection, comp, compCollection];
        for (const index in names) {
            for (const refName of names[index]) {
                const managedRef = ManagedRefsConstructors[index]()
                this.refs[refName] = managedRef;
                mkPrivateRefs.push(() => {
                    let { currData, coordinate} = currentConstructionContext();
                    return managedRef.mkManagedRef(currData, coordinate(refName), this.eventWrapper)
                })
            }
        }
        return mkPrivateRefs;
    }

    applyToElement<T, Refs>(element: BaseJayElement<T>): JayElement<T, Refs> {
        let enrichedDynamicRefs = Object.keys(this.refs).reduce((publicRefAPIs, key) => {
            publicRefAPIs[key] = this.refs[key].getPublicAPI();
            return publicRefAPIs;
        }, {});
        let refs = enrichedDynamicRefs as Refs;
        return { ...element, refs };
    }

    static for(options: RenderElementOptions,
               elem: string[],
               elemCollection: string[],
               comp: string[],
               compCollection: string[]): [ReferencesManager, PrivateRefConstructor<any>[]] {
        const refManager = new ReferencesManager(options.eventWrapper)
        return [refManager, refManager.mkRefs(elem, elemCollection, comp, compCollection)]
    }
}
