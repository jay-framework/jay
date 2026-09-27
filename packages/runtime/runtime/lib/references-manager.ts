import {
    BaseJayElement,
    Coordinate,
    JayElement,
    JayEvent,
    JayEventHandler,
    JayEventHandlerWrapper,
    RenderElementOptions,
} from './element-types';
import {
    ComponentCollectionRefImpl,
    ComponentRefsImpl,
    HTMLElementCollectionRefImpl,
    HTMLElementRefsImpl,
    PrivateRef,
} from './node-reference';
import { currentConstructionContext } from './context';

export interface ManagedRefs {
    getPublicAPI(): any;

    mkManagedRef(
        currData: any,
        strings: Coordinate,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ): any;
}

export function defaultEventWrapper<EventType, ViewState, Returns>(
    orig: JayEventHandler<EventType, ViewState, Returns>,
    event: JayEvent<EventType, ViewState>,
): Returns {
    return orig(event);
}

export type ManagedRefConstructor = () => ManagedRefs;
export type PrivateRefConstructor<ViewState> = () => PrivateRef<ViewState, any>;

export enum ManagedRefType {
    element = 0,
    elementCollection = 1,
    component = 2,
    componentCollection = 3,
}

export abstract class BaseReferencesManager {
    private refs: Record<string, ManagedRefs | BaseReferencesManager> = {};
    private refsPublicAPI: object;

    constructor(
        public readonly eventWrapper: JayEventHandlerWrapper<any, any, any> = defaultEventWrapper,
    ) {}

    abstract mkManagedRef(refType: ManagedRefType, refName: string): ManagedRefs;
    abstract currentContext(): { currData: any; coordinate: (refName: string) => Coordinate };

    private mkRefsOfType<ViewState>(
        refType: ManagedRefType,
        refNames: string[],
    ): PrivateRefConstructor<ViewState>[] {
        return refNames.map((refName) => {
            const managedRef = this.mkManagedRef(refType, refName);
            this.refs[refName] = managedRef;
            return () => {
                let { currData, coordinate } = this.currentContext();
                return managedRef.mkManagedRef(currData, coordinate(refName), this.eventWrapper);
            };
        });
    }

    mkRefs<ViewState>(
        elem: string[],
        elemCollection: string[],
        comp: string[],
        compCollection: string[],
        childRefManagers: Record<string, BaseReferencesManager> = {},
    ): PrivateRefConstructor<ViewState>[] {
        this.refs = childRefManagers;
        return [
            ...this.mkRefsOfType<ViewState>(ManagedRefType.element, elem),
            ...this.mkRefsOfType<ViewState>(ManagedRefType.elementCollection, elemCollection),
            ...this.mkRefsOfType<ViewState>(ManagedRefType.component, comp),
            ...this.mkRefsOfType<ViewState>(ManagedRefType.componentCollection, compCollection),
        ];
    }

    private mkRefsPublicAPI() {
        this.refsPublicAPI = Object.keys(this.refs).reduce((publicRefAPIs, key) => {
            publicRefAPIs[key] = this.refs[key].getPublicAPI();
            return publicRefAPIs;
        }, {});
    }

    get(refName: string) {
        return this.refs[refName];
    }

    // DL#198 Design D — page-side free-ref driver. This manager is a FreeReferenceManager the page built
    // for one region (page scope → its `eventWrapper` is the page's batchReactions). At region mount the
    // page reaches into the region's own refs public API (`regionRefs[name]` — the aggregate proxy, which
    // exposes `getCarriers()` by falling through the GetTrapProxy) and, for every free-ref name this manager
    // owns, mints a page-context RefImpl over the same DOM node: page eventWrapper + the composed coordinate
    // (region path prepended to the free-ref's region-relative coordinate). Mounting each minted ref replays
    // any page subscriptions recorded before the region rendered. Returns an unmount thunk.
    driveFreeRefsFrom(
        regionRefs: Record<string, { getCarriers?: () => any[] }>,
        regionCoordinate: Coordinate,
    ): () => void {
        const teardowns: Array<() => void> = [];
        for (const name of Object.keys(this.refs)) {
            const pageAggregate = this.refs[name] as ManagedRefs;
            const regionAggregate = regionRefs?.[name];
            if (!regionAggregate || typeof regionAggregate.getCarriers !== 'function') continue;
            for (const carrier of regionAggregate.getCarriers()) {
                const pageRef = pageAggregate.mkManagedRef(
                    carrier.viewState,
                    [...regionCoordinate, ...carrier.coordinate],
                    this.eventWrapper,
                ) as PrivateRef<any, any>;
                pageRef.set(carrier.element);
                pageRef.mount();
                teardowns.push(pageRef.unmount);
            }
        }
        return () => teardowns.forEach((teardown) => teardown());
    }

    getPublicAPI() {
        if (!this.refsPublicAPI) this.mkRefsPublicAPI();
        return this.refsPublicAPI;
    }

    applyToElement<T, Refs>(element: BaseJayElement<T>): JayElement<T, Refs> {
        return { ...element, refs: this.getPublicAPI() as Refs };
    }
}

export class ReferencesManager extends BaseReferencesManager {
    mkManagedRef(refType: ManagedRefType, _refName: string): ManagedRefs {
        switch (refType) {
            case ManagedRefType.element:
                return new HTMLElementRefsImpl();
            case ManagedRefType.elementCollection:
                return new HTMLElementCollectionRefImpl();
            case ManagedRefType.component:
                return new ComponentRefsImpl();
            case ManagedRefType.componentCollection:
                return new ComponentCollectionRefImpl();
        }
    }

    currentContext(): { currData: any; coordinate: (refName: string) => Coordinate } {
        const { currData, coordinate } = currentConstructionContext();
        return { currData, coordinate };
    }

    static for(
        options: RenderElementOptions,
        elem: string[],
        elemCollection: string[],
        comp: string[],
        compCollection: string[],
        childRefManagers?: Record<string, ReferencesManager>,
    ): [ReferencesManager, PrivateRefConstructor<any>[]] {
        const refManager = new ReferencesManager(options?.eventWrapper);
        return [
            refManager,
            refManager.mkRefs(elem, elemCollection, comp, compCollection, childRefManagers),
        ];
    }
}
