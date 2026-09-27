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

    getPublicAPI() {
        if (!this.refsPublicAPI) this.mkRefsPublicAPI();
        return this.refsPublicAPI;
    }

    applyToElement<T, Refs>(element: BaseJayElement<T>): JayElement<T, Refs> {
        return { ...element, refs: this.getPublicAPI() as Refs };
    }
}

export class ReferencesManager extends BaseReferencesManager {
    mkManagedRef(refType: ManagedRefType): ManagedRefs {
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
