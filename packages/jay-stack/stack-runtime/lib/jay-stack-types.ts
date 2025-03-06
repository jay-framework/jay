import {ComponentConstructor, ConcreteJayComponent, ContextMarkers, JayComponentCore} from "jay-component";
import {JayElement, PreRenderElement} from "jay-runtime";

export type UrlParams = Array<Record<string, string>>
export type LoadParams<ServerContexts> = (contexts: ServerContexts) => Promise<UrlParams>

export interface PartialRender<ViewState extends object, CarryForward> {
    render: Partial<ViewState>,
    carryForward: CarryForward
}

export type RenderSlowly<ServerContexts, PropsT extends object, StaticViewState extends object, SlowlyCarryForward> =
    (contexts: ServerContexts, props: PropsT) => PartialRender<StaticViewState, SlowlyCarryForward>
export type RenderFast<ServerContexts, PropsT extends object, SlowlyCarryForward, DynamicViewState extends object, FastCarryForward> =
    (contexts: ServerContexts, props: PropsT) => PartialRender<DynamicViewState, FastCarryForward>

export type PartialSubtract<T, P extends Partial<T>> = Omit<T, keyof P>;

export interface ComponentDeclaration<
    PropsT extends object,
    ViewState extends object,
    StaticViewState extends Partial<ViewState>,
    DynamicViewState extends PartialSubtract<ViewState, StaticViewState>,
    Refs extends object,
    SlowlyCarryForward extends object,
    FastCarryForward extends object,
    JayElementT extends JayElement<DynamicViewState, Refs>,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, DynamicViewState>,
> {
    elementPreRender: PreRenderElement<DynamicViewState, Refs, JayElementT>,
    loadParams?: LoadParams<ServerContexts>
    renderSlowlyChanging?: RenderSlowly<ServerContexts, PropsT, StaticViewState, SlowlyCarryForward>,
    renderFastChanging?: RenderFast<ServerContexts, PropsT & SlowlyCarryForward, SlowlyCarryForward, DynamicViewState, FastCarryForward>
    comp: ComponentConstructor<PropsT & FastCarryForward, Refs, DynamicViewState, ClientContexts, CompCore>,
}

