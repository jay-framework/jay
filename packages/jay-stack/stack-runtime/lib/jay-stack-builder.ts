import {ComponentConstructor, ContextMarkers, JayComponentCore} from "jay-component";
import {JayElement, PreRenderElement} from "jay-runtime";

export interface PartialRender<ViewState extends object, CarryForward> {
    render: Partial<ViewState>,
    carryForward: CarryForward
}

export type UrlParams = Record<string, string>;
export type LoadParams<ServerContexts, Params extends UrlParams> = (contexts: ServerContexts) => Promise<Iterator<Params>>
export type RenderSlowly<ServerContexts extends Array<object>, PropsT extends object, StaticViewState extends object, SlowlyCarryForward> =
    (props: PropsT, ...contexts: ServerContexts) => Promise<PartialRender<StaticViewState, SlowlyCarryForward>>
export type RenderFast<ServerContexts extends Array<object>, PropsT extends object, SlowlyCarryForward, DynamicViewState extends object, FastCarryForward> =
    (props: PropsT & SlowlyCarryForward, ...contexts: ServerContexts) => Promise<PartialRender<DynamicViewState, FastCarryForward>>


type BuilderStates = "Props" | // requires setting the props type. Next allowed states are "ServerContexts", "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    "ServerContexts" | // allowing to set server contexts. Next allowed states are "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    "ClientContexts" | // allowing to set client contexts. Next allowed states are "UrlLoader", "Slowly", "Fast", "Interactive"
    "UrlLoader" | // allowing to set the urlLoader function. Next allowed states are "Slowly", "Fast", "Interactive"
    "SlowlyRender" | // allowing to set slowly render function. Next allowed states are "Fast", "Interactive"
    "FastRender" | // allowing to set slowly render function. Next allowed states is only "Interactive"
    "InteractiveRender" | // allowing to set the slowly render function. Next step is a placeholder for done
    "Done" // does not allow setting anything more

export type Builder<
    State extends BuilderStates,
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>
> = State extends "Props" ? {
        withProps<NewPropsT extends object>():
            Builder<"ServerContexts", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, NewPropsT, CarryForward, JayComponentCore<NewPropsT, ViewState>>;
    } :
    State extends "ServerContexts" ? {
            withServerContext<NewServerContexts extends Array<any>>(...contextMarkers: ContextMarkers<NewServerContexts>):
                Builder<"ClientContexts", StaticViewState, ViewState, Refs, JayElementT, NewServerContexts, ClientContexts, PropsT, CarryForward, CompCore>
            withClientContext<NewClientContexts extends Array<any>>(...contextMarkers: ContextMarkers<NewClientContexts>):
                Builder<"UrlLoader", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, NewClientContexts, PropsT, CarryForward, CompCore>


            withLoadParams<NewParams extends UrlParams>(loadParams: LoadParams<ServerContexts, NewParams>):
                Builder<"SlowlyRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT & NewParams, CarryForward, CompCore>

            withSlowlyRender<NewStaticViewState extends Partial<ViewState>,
                DynamicViewState extends Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                NewCarryForward extends object,
                NewCompCore extends JayComponentCore<PropsT, DynamicViewState>>(
                slowlyRender: RenderSlowly<ServerContexts, PropsT, NewStaticViewState, NewCarryForward>):
                Builder<"FastRender", NewStaticViewState, DynamicViewState, Refs, JayElement<DynamicViewState, Refs>, ServerContexts, ClientContexts, PropsT,
                    NewCarryForward, NewCompCore>

            withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<ServerContexts, PropsT & CarryForward, CarryForward, ViewState, NewCarryForward>):
                Builder<"InteractiveRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, NewCarryForward, CompCore>

            withInteractive(comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>):
                Builder<"Done", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, CarryForward, CompCore>

    } :
        State extends "ClientContexts" ? {
                withClientContext<NewClientContexts extends Array<any>>(...contextMarkers: ContextMarkers<NewClientContexts>):
                    Builder<"UrlLoader", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, NewClientContexts, PropsT, CarryForward, CompCore>


                withLoadParams<NewParams extends UrlParams>(loadParams: LoadParams<ServerContexts, NewParams>):
                    Builder<"SlowlyRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT & NewParams, CarryForward, CompCore>

                withSlowlyRender<NewStaticViewState extends Partial<ViewState>,
                    DynamicViewState extends Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                    NewCarryForward extends object,
                    NewCompCore extends JayComponentCore<PropsT, DynamicViewState>>(
                    slowlyRender: RenderSlowly<ServerContexts, PropsT, NewStaticViewState, NewCarryForward>):
                    Builder<"FastRender", NewStaticViewState, DynamicViewState, Refs, JayElement<DynamicViewState, Refs>, ServerContexts, ClientContexts, PropsT,
                        NewCarryForward, NewCompCore>

                withFastRender<NewCarryForward extends object>(
                    fastRender: RenderFast<ServerContexts, PropsT & CarryForward, CarryForward, ViewState, NewCarryForward>):
                    Builder<"InteractiveRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, NewCarryForward, CompCore>

                withInteractive(comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>):
                    Builder<"Done", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, CarryForward, CompCore>

            } :
            State extends "UrlLoader" ? {
                    withLoadParams<NewParams extends UrlParams>(loadParams: LoadParams<ServerContexts, NewParams>):
                        Builder<"SlowlyRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT & NewParams, CarryForward, CompCore>

                    withSlowlyRender<NewStaticViewState extends Partial<ViewState>,
                        DynamicViewState extends Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                        NewCarryForward extends object,
                        NewCompCore extends JayComponentCore<PropsT, DynamicViewState>>(
                        slowlyRender: RenderSlowly<ServerContexts, PropsT, NewStaticViewState, NewCarryForward>):
                        Builder<"FastRender", NewStaticViewState, DynamicViewState, Refs, JayElement<DynamicViewState, Refs>, ServerContexts, ClientContexts, PropsT,
                            NewCarryForward, NewCompCore>

                    withFastRender<NewCarryForward extends object>(
                        fastRender: RenderFast<ServerContexts, PropsT & CarryForward, CarryForward, ViewState, NewCarryForward>):
                        Builder<"InteractiveRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, NewCarryForward, CompCore>

                    withInteractive(comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>):
                        Builder<"Done", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, CarryForward, CompCore>
                } :
                State extends "SlowlyRender" ? {
                        withSlowlyRender<NewStaticViewState extends Partial<ViewState>,
                            DynamicViewState extends Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                            NewCarryForward extends object,
                            NewCompCore extends JayComponentCore<PropsT, DynamicViewState>>(
                            slowlyRender: RenderSlowly<ServerContexts, PropsT, NewStaticViewState, NewCarryForward>):
                            Builder<"FastRender", NewStaticViewState, DynamicViewState, Refs, JayElement<DynamicViewState, Refs>, ServerContexts, ClientContexts, PropsT,
                                NewCarryForward, NewCompCore>

                        withFastRender<NewCarryForward extends object>(
                            fastRender: RenderFast<ServerContexts, PropsT & CarryForward, CarryForward, ViewState, NewCarryForward>):
                            Builder<"InteractiveRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, NewCarryForward, CompCore>

                        withInteractive(comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>):
                            Builder<"Done", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, CarryForward, CompCore>
                    } :
                    State extends "FastRender" ? {
                            withFastRender<NewCarryForward extends object>(
                                fastRender: RenderFast<ServerContexts, PropsT & CarryForward, CarryForward, ViewState, NewCarryForward>):
                                Builder<"InteractiveRender", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, NewCarryForward, CompCore>

                            withInteractive(comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>):
                                Builder<"Done", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, CarryForward, CompCore>
                        } :
                        State extends "InteractiveRender" ? {
                                withInteractive(comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>):
                                    Builder<"Done", StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, CarryForward, CompCore>
                            } : never;

class BuilderImplementation<
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
> {
    constructor(public readonly render: PreRenderElement<ViewState, Refs, JayElementT>) {}
}

export function makeJayStackComponent<
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>
>(render: PreRenderElement<ViewState, Refs, JayElementT>) {
    return new BuilderImplementation(render) as unknown as
        Builder<"Props", object, ViewState, Refs, JayElementT, [], [], {}, object, JayComponentCore<object, ViewState>>
}