import { ComponentConstructor, ContextMarkers, JayComponentCore } from 'jay-component';
import { JayElement, PreRenderElement } from 'jay-runtime';
import {
    JayStackComponentDefinition,
    LoadParams,
    RenderFast,
    RenderSlowly,
    UrlParams,
} from './jay-stack-types';

type BuilderStates =
    | 'Props' // requires setting the props type. Next allowed states are "ServerContexts", "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'ServerContexts' // allowing to set server contexts. Next allowed states are "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'ClientContexts' // allowing to set client contexts. Next allowed states are "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'UrlLoader' // allowing to set the urlLoader function. Next allowed states are "Slowly", "Fast", "Interactive"
    | 'SlowlyRender' // allowing to set slowly render function. Next allowed states are "Fast", "Interactive"
    | 'FastRender' // allowing to set slowly render function. Next allowed states is only "Interactive"
    | 'InteractiveRender' // allowing to set the slowly render function. Next step is a placeholder for done
    | 'Done'; // does not allow setting anything more

export type Builder<
    State extends BuilderStates,
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> = State extends 'Props'
    ? JayStackComponentDefinition<
          StaticViewState,
          ViewState,
          Refs,
          ServerContexts,
          ClientContexts,
          PropsT,
          Params,
          CarryForward,
          CompCore
      > & {
          withProps<NewPropsT extends object>(): Builder<
              'ServerContexts',
              StaticViewState,
              ViewState,
              Refs,
              ServerContexts,
              ClientContexts,
              NewPropsT,
              Params,
              CarryForward,
              JayComponentCore<NewPropsT, ViewState>
          >;
      }
    : State extends 'ServerContexts'
      ? JayStackComponentDefinition<
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            ClientContexts,
            PropsT,
            Params,
            CarryForward,
            CompCore
        > & {
            withServerContext<NewServerContexts extends Array<any>>(
                ...contextMarkers: ContextMarkers<NewServerContexts>
            ): Builder<
                'ClientContexts',
                StaticViewState,
                ViewState,
                Refs,
                NewServerContexts,
                ClientContexts,
                PropsT,
                Params,
                CarryForward,
                CompCore
            >;
            withClientContext<NewClientContexts extends Array<any>>(
                ...contextMarkers: ContextMarkers<NewClientContexts>
            ): Builder<
                'UrlLoader',
                StaticViewState,
                ViewState,
                Refs,
                ServerContexts,
                NewClientContexts,
                PropsT,
                Params,
                CarryForward,
                CompCore
            >;

            withLoadParams<NewParams extends UrlParams>(
                loadParams: LoadParams<ServerContexts, NewParams>,
            ): Builder<
                'SlowlyRender',
                StaticViewState,
                ViewState,
                Refs,
                ServerContexts,
                ClientContexts,
                PropsT & NewParams,
                NewParams,
                CarryForward,
                CompCore
            >;

            withSlowlyRender<
                NewStaticViewState extends Partial<ViewState>,
                NewCarryForward extends object,
            >(
                slowlyRender: RenderSlowly<
                    ServerContexts,
                    PropsT,
                    NewStaticViewState,
                    NewCarryForward
                >,
            ): Builder<
                'FastRender',
                NewStaticViewState,
                Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                Refs,
                ServerContexts,
                ClientContexts,
                PropsT,
                Params,
                NewCarryForward,
                JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
            >;

            withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<
                    ServerContexts,
                    PropsT & CarryForward,
                    CarryForward,
                    ViewState,
                    NewCarryForward
                >,
            ): Builder<
                'InteractiveRender',
                StaticViewState,
                Partial<ViewState>,
                Refs,
                ServerContexts,
                ClientContexts,
                PropsT,
                Params,
                NewCarryForward,
                JayComponentCore<PropsT, Partial<ViewState>>
            >;

            withInteractive(
                comp: ComponentConstructor<
                    PropsT & CarryForward,
                    Refs,
                    ViewState,
                    ClientContexts,
                    CompCore
                >,
            ): Builder<
                'Done',
                StaticViewState,
                ViewState,
                Refs,
                ServerContexts,
                ClientContexts,
                PropsT,
                Params,
                CarryForward,
                CompCore
            >;
        }
      : State extends 'ClientContexts'
        ? JayStackComponentDefinition<
              StaticViewState,
              ViewState,
              Refs,
              ServerContexts,
              ClientContexts,
              PropsT,
              Params,
              CarryForward,
              CompCore
          > & {
              withClientContext<NewClientContexts extends Array<any>>(
                  ...contextMarkers: ContextMarkers<NewClientContexts>
              ): Builder<
                  'UrlLoader',
                  StaticViewState,
                  ViewState,
                  Refs,
                  ServerContexts,
                  NewClientContexts,
                  PropsT,
                  Params,
                  CarryForward,
                  CompCore
              >;

              withLoadParams<NewParams extends UrlParams>(
                  loadParams: LoadParams<ServerContexts, NewParams>,
              ): Builder<
                  'SlowlyRender',
                  StaticViewState,
                  ViewState,
                  Refs,
                  ServerContexts,
                  ClientContexts,
                  PropsT & NewParams,
                  NewParams,
                  CarryForward,
                  CompCore
              >;

              withSlowlyRender<
                  NewStaticViewState extends Partial<ViewState>,
                  NewCarryForward extends object,
              >(
                  slowlyRender: RenderSlowly<
                      ServerContexts,
                      PropsT,
                      NewStaticViewState,
                      NewCarryForward
                  >,
              ): Builder<
                  'FastRender',
                  NewStaticViewState,
                  Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                  Refs,
                  ServerContexts,
                  ClientContexts,
                  PropsT,
                  Params,
                  NewCarryForward,
                  JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
              >;

              withFastRender<NewCarryForward extends object>(
                  fastRender: RenderFast<
                      ServerContexts,
                      PropsT & CarryForward,
                      CarryForward,
                      ViewState,
                      NewCarryForward
                  >,
              ): Builder<
                  'InteractiveRender',
                  StaticViewState,
                  Partial<ViewState>,
                  Refs,
                  ServerContexts,
                  ClientContexts,
                  PropsT,
                  Params,
                  NewCarryForward,
                  JayComponentCore<PropsT, Partial<ViewState>>
              >;

              withInteractive(
                  comp: ComponentConstructor<
                      PropsT & CarryForward,
                      Refs,
                      ViewState,
                      ClientContexts,
                      CompCore
                  >,
              ): Builder<
                  'Done',
                  StaticViewState,
                  ViewState,
                  Refs,
                  ServerContexts,
                  ClientContexts,
                  PropsT,
                  Params,
                  CarryForward,
                  CompCore
              >;
          }
        : State extends 'UrlLoader'
          ? JayStackComponentDefinition<
                StaticViewState,
                ViewState,
                Refs,
                ServerContexts,
                ClientContexts,
                PropsT,
                Params,
                CarryForward,
                CompCore
            > & {
                withLoadParams<NewParams extends UrlParams>(
                    loadParams: LoadParams<ServerContexts, NewParams>,
                ): Builder<
                    'SlowlyRender',
                    StaticViewState,
                    ViewState,
                    Refs,
                    ServerContexts,
                    ClientContexts,
                    PropsT & NewParams,
                    NewParams,
                    CarryForward,
                    CompCore
                >;

                withSlowlyRender<
                    NewStaticViewState extends Partial<ViewState>,
                    NewCarryForward extends object,
                >(
                    slowlyRender: RenderSlowly<
                        ServerContexts,
                        PropsT,
                        NewStaticViewState,
                        NewCarryForward
                    >,
                ): Builder<
                    'FastRender',
                    NewStaticViewState,
                    Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                    Refs,
                    ServerContexts,
                    ClientContexts,
                    PropsT,
                    Params,
                    NewCarryForward,
                    JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
                >;

                withFastRender<NewCarryForward extends object>(
                    fastRender: RenderFast<
                        ServerContexts,
                        PropsT & CarryForward,
                        CarryForward,
                        ViewState,
                        NewCarryForward
                    >,
                ): Builder<
                    'InteractiveRender',
                    StaticViewState,
                    Partial<ViewState>,
                    Refs,
                    ServerContexts,
                    ClientContexts,
                    PropsT,
                    Params,
                    NewCarryForward,
                    JayComponentCore<PropsT, Partial<ViewState>>
                >;

                withInteractive(
                    comp: ComponentConstructor<
                        PropsT & CarryForward,
                        Refs,
                        ViewState,
                        ClientContexts,
                        CompCore
                    >,
                ): Builder<
                    'Done',
                    StaticViewState,
                    ViewState,
                    Refs,
                    ServerContexts,
                    ClientContexts,
                    PropsT,
                    Params,
                    CarryForward,
                    CompCore
                >;
            }
          : State extends 'SlowlyRender'
            ? JayStackComponentDefinition<
                  StaticViewState,
                  ViewState,
                  Refs,
                  ServerContexts,
                  ClientContexts,
                  PropsT,
                  Params,
                  CarryForward,
                  CompCore
              > & {
                  withSlowlyRender<
                      NewStaticViewState extends Partial<ViewState>,
                      NewCarryForward extends object,
                  >(
                      slowlyRender: RenderSlowly<
                          ServerContexts,
                          PropsT,
                          NewStaticViewState,
                          NewCarryForward
                      >,
                  ): Builder<
                      'FastRender',
                      NewStaticViewState,
                      Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                      Refs,
                      ServerContexts,
                      ClientContexts,
                      PropsT,
                      Params,
                      NewCarryForward,
                      JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
                  >;

                  withFastRender<NewCarryForward extends object>(
                      fastRender: RenderFast<
                          ServerContexts,
                          PropsT & CarryForward,
                          CarryForward,
                          ViewState,
                          NewCarryForward
                      >,
                  ): Builder<
                      'InteractiveRender',
                      StaticViewState,
                      Partial<ViewState>,
                      Refs,
                      ServerContexts,
                      ClientContexts,
                      PropsT,
                      Params,
                      NewCarryForward,
                      JayComponentCore<PropsT, Partial<ViewState>>
                  >;

                  withInteractive(
                      comp: ComponentConstructor<
                          PropsT & CarryForward,
                          Refs,
                          ViewState,
                          ClientContexts,
                          CompCore
                      >,
                  ): Builder<
                      'Done',
                      StaticViewState,
                      ViewState,
                      Refs,
                      ServerContexts,
                      ClientContexts,
                      PropsT,
                      Params,
                      CarryForward,
                      CompCore
                  >;
              }
            : State extends 'FastRender'
              ? JayStackComponentDefinition<
                    StaticViewState,
                    ViewState,
                    Refs,
                    ServerContexts,
                    ClientContexts,
                    PropsT,
                    Params,
                    CarryForward,
                    CompCore
                > & {
                    withFastRender<NewCarryForward extends object>(
                        fastRender: RenderFast<
                            ServerContexts,
                            PropsT & CarryForward,
                            CarryForward,
                            ViewState,
                            NewCarryForward
                        >,
                    ): Builder<
                        'InteractiveRender',
                        StaticViewState,
                        Partial<ViewState>,
                        Refs,
                        ServerContexts,
                        ClientContexts,
                        PropsT,
                        Params,
                        NewCarryForward,
                        JayComponentCore<PropsT, Partial<ViewState>>
                    >;

                    withInteractive(
                        comp: ComponentConstructor<
                            PropsT & CarryForward,
                            Refs,
                            ViewState,
                            ClientContexts,
                            CompCore
                        >,
                    ): Builder<
                        'Done',
                        StaticViewState,
                        ViewState,
                        Refs,
                        ServerContexts,
                        ClientContexts,
                        PropsT,
                        Params,
                        CarryForward,
                        CompCore
                    >;
                }
              : State extends 'InteractiveRender'
                ? JayStackComponentDefinition<
                      StaticViewState,
                      ViewState,
                      Refs,
                      ServerContexts,
                      ClientContexts,
                      PropsT,
                      Params,
                      CarryForward,
                      CompCore
                  > & {
                      withInteractive(
                          comp: ComponentConstructor<
                              PropsT & CarryForward,
                              Refs,
                              ViewState,
                              ClientContexts,
                              CompCore
                          >,
                      ): Builder<
                          'Done',
                          StaticViewState,
                          ViewState,
                          Refs,
                          ServerContexts,
                          ClientContexts,
                          PropsT,
                          Params,
                          CarryForward,
                          CompCore
                      >;
                  }
                : JayStackComponentDefinition<
                      StaticViewState,
                      ViewState,
                      Refs,
                      ServerContexts,
                      ClientContexts,
                      PropsT,
                      Params,
                      CarryForward,
                      CompCore
                  >;

class BuilderImplementation<
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> implements
        JayStackComponentDefinition<
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            ClientContexts,
            PropsT,
            Params,
            CarryForward,
            CompCore
        >
{
    serverContexts: ContextMarkers<ServerContexts> = [] as ContextMarkers<ServerContexts>;
    clientContexts: ContextMarkers<ClientContexts> = [] as ContextMarkers<ClientContexts>;
    loadParams: LoadParams<ServerContexts, Params>;
    slowlyRender: RenderSlowly<ServerContexts, PropsT, StaticViewState, CarryForward>;
    fastRender: RenderFast<
        ServerContexts,
        PropsT & CarryForward,
        CarryForward,
        ViewState,
        CarryForward
    >;
    comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>;
    constructor() {}

    withProps<NewPropsT extends object>(): Builder<
        'ServerContexts',
        StaticViewState,
        ViewState,
        Refs,
        ServerContexts,
        ClientContexts,
        NewPropsT,
        Params,
        CarryForward,
        JayComponentCore<NewPropsT, ViewState>
    > {
        return this as unknown as Builder<
            'ServerContexts',
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            ClientContexts,
            NewPropsT,
            Params,
            CarryForward,
            JayComponentCore<NewPropsT, ViewState>
        >;
    }

    withServerContext<NewServerContexts extends Array<any>>(
        ...contextMarkers: ContextMarkers<NewServerContexts>
    ): Builder<
        'ClientContexts',
        StaticViewState,
        ViewState,
        Refs,
        NewServerContexts,
        ClientContexts,
        PropsT,
        Params,
        CarryForward,
        CompCore
    > {
        this.serverContexts = contextMarkers as ContextMarkers<ServerContexts>;
        return this as unknown as Builder<
            'ClientContexts',
            StaticViewState,
            ViewState,
            Refs,
            NewServerContexts,
            ClientContexts,
            PropsT,
            Params,
            CarryForward,
            CompCore
        >;
    }

    withClientContext<NewClientContexts extends Array<any>>(
        ...contextMarkers: ContextMarkers<NewClientContexts>
    ): Builder<
        'UrlLoader',
        StaticViewState,
        ViewState,
        Refs,
        ServerContexts,
        NewClientContexts,
        PropsT,
        Params,
        CarryForward,
        CompCore
    > {
        this.clientContexts = contextMarkers as ContextMarkers<ClientContexts>;
        return this as unknown as Builder<
            'UrlLoader',
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            NewClientContexts,
            PropsT,
            Params,
            CarryForward,
            CompCore
        >;
    }

    withLoadParams<NewParams extends UrlParams>(
        loadParams: LoadParams<ServerContexts, NewParams>,
    ): Builder<
        'SlowlyRender',
        StaticViewState,
        ViewState,
        Refs,
        ServerContexts,
        ClientContexts,
        PropsT & NewParams,
        NewParams,
        CarryForward,
        CompCore
    > {
        this.loadParams = loadParams as unknown as LoadParams<ServerContexts, Params>;
        return this as unknown as Builder<
            'SlowlyRender',
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            ClientContexts,
            PropsT & NewParams,
            NewParams,
            CarryForward,
            CompCore
        >;
    }

    withSlowlyRender<
        NewStaticViewState extends Partial<ViewState>,
        NewCarryForward extends object,
    >(
        slowlyRender: RenderSlowly<
            ServerContexts,
            PropsT,
            NewStaticViewState,
            NewCarryForward
        >,
    ): Builder<
        'FastRender',
        NewStaticViewState,
        Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
        Refs,
        ServerContexts,
        ClientContexts,
        PropsT,
        Params,
        NewCarryForward,
        JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
    > {
        this.slowlyRender = slowlyRender as unknown as RenderSlowly<
            ServerContexts,
            PropsT,
            StaticViewState,
            CarryForward
        >;
        return this as unknown as Builder<
            'FastRender',
            NewStaticViewState,
            Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
            Refs,
            ServerContexts,
            ClientContexts,
            PropsT,
            Params,
            NewCarryForward,
            JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
        >;
    }

    withFastRender<NewCarryForward extends object>(
        fastRender: RenderFast<
            ServerContexts,
            PropsT & CarryForward,
            CarryForward,
            ViewState,
            NewCarryForward
        >,
    ): Builder<
        'InteractiveRender',
        StaticViewState,
        Partial<ViewState>,
        Refs,
        ServerContexts,
        ClientContexts,
        PropsT,
        Params,
        NewCarryForward,
        JayComponentCore<PropsT, Partial<ViewState>>
    > {
        this.fastRender = fastRender as unknown as RenderFast<
            ServerContexts,
            PropsT & CarryForward,
            CarryForward,
            ViewState,
            CarryForward
        >;
        return this as unknown as Builder<
            'InteractiveRender',
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            ClientContexts,
            PropsT,
            Params,
            NewCarryForward,
            CompCore
        >;
    }

    withInteractive(
        comp: ComponentConstructor<
            PropsT & CarryForward,
            Refs,
            ViewState,
            ClientContexts,
            CompCore
        >,
    ): Builder<
        'Done',
        StaticViewState,
        ViewState,
        Refs,
        ServerContexts,
        ClientContexts,
        PropsT,
        Params,
        CarryForward,
        CompCore
    > {
        this.comp = comp;
        return this as unknown as Builder<
            'Done',
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            ClientContexts,
            PropsT,
            Params,
            CarryForward,
            CompCore
        >;
    }
}

type ExtractViewState<A> = A extends PreRenderElement<infer ViewState, any, any> ? ViewState : never;
type ExtractRefs<A> = A extends PreRenderElement<any, infer Refs, any> ? Refs : never;

export function makeJayStackComponent<
    Render extends PreRenderElement<any, any, any>
>() {
    return new BuilderImplementation() as unknown as Builder<
        'Props',
        object,
        ExtractViewState<Render>,
        ExtractRefs<Render>,
        [],
        [],
        {},
        {},
        object,
        JayComponentCore<object, ExtractViewState<Render>>
    >;
}
