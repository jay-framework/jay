import { ComponentConstructor, ContextMarkers, JayComponentCore } from 'jay-component';
import { JayElement } from 'jay-runtime';
import {
    ExtractRefs,
    ExtractViewState, JayContract,
    JayStackComponentDefinition,
    LoadParams,
    RenderFast,
    RenderSlowly,
    UrlParams,
} from './jay-stack-types';
import { Getter, Setter } from 'jay-reactive';

type BuilderStates =
    | 'Props' // requires setting the props type. Next allowed states are "ServerContexts", "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'ServerContexts' // allowing to set server contexts. Next allowed states are "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'ClientContexts' // allowing to set client contexts. Next allowed states are "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'UrlLoader' // allowing to set the urlLoader function. Next allowed states are "Slowly", "Fast", "Interactive"
    | 'SlowlyRender' // allowing to set slowly render function. Next allowed states are "Fast", "Interactive"
    | 'FastRender' // allowing to set slowly render function. Next allowed states is only "Interactive"
    | 'InteractiveRender' // allowing to set the slowly render function. Next step is a placeholder for done
    | 'Done'; // does not allow setting anything more

export type Signals<T extends object> = {
    [K in keyof T]: K extends string ? [Getter<T[K]>, Setter<T[K]>] : T[K];
};

export type Builder<
    State extends BuilderStates,
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
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
                [NewCarryForward, ...ServerContexts],
                ClientContexts,
                PropsT,
                Params,
                JayComponentCore<
                    PropsT,
                    Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                >
            >;

            withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<ServerContexts, PropsT, ViewState, NewCarryForward>,
            ): Builder<
                'InteractiveRender',
                StaticViewState,
                Partial<ViewState>,
                Refs,
                ServerContexts,
                [Signals<NewCarryForward>, ...ClientContexts],
                PropsT,
                Params,
                JayComponentCore<PropsT, Partial<ViewState>>
            >;

            withInteractive(
                comp: ComponentConstructor<PropsT, Refs, ViewState, ClientContexts, CompCore>,
            ): Builder<
                'Done',
                StaticViewState,
                ViewState,
                Refs,
                ServerContexts,
                ClientContexts,
                PropsT,
                Params,
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
                  [NewCarryForward, ...ServerContexts],
                  ClientContexts,
                  PropsT,
                  Params,
                  JayComponentCore<
                      PropsT,
                      Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                  >
              >;

              withFastRender<NewCarryForward extends object>(
                  fastRender: RenderFast<ServerContexts, PropsT, ViewState, NewCarryForward>,
              ): Builder<
                  'InteractiveRender',
                  StaticViewState,
                  Partial<ViewState>,
                  Refs,
                  ServerContexts,
                  [Signals<NewCarryForward>, ...ClientContexts],
                  PropsT,
                  Params,
                  JayComponentCore<PropsT, Partial<ViewState>>
              >;

              withInteractive(
                  comp: ComponentConstructor<PropsT, Refs, ViewState, ClientContexts, CompCore>,
              ): Builder<
                  'Done',
                  StaticViewState,
                  ViewState,
                  Refs,
                  ServerContexts,
                  ClientContexts,
                  PropsT,
                  Params,
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
                    [NewCarryForward, ...ServerContexts],
                    ClientContexts,
                    PropsT,
                    Params,
                    JayComponentCore<
                        PropsT,
                        Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                    >
                >;

                withFastRender<NewCarryForward extends object>(
                    fastRender: RenderFast<ServerContexts, PropsT, ViewState, NewCarryForward>,
                ): Builder<
                    'InteractiveRender',
                    StaticViewState,
                    Partial<ViewState>,
                    Refs,
                    ServerContexts,
                    [Signals<NewCarryForward>, ...ClientContexts],
                    PropsT,
                    Params,
                    JayComponentCore<PropsT, Partial<ViewState>>
                >;

                withInteractive(
                    comp: ComponentConstructor<PropsT, Refs, ViewState, ClientContexts, CompCore>,
                ): Builder<
                    'Done',
                    StaticViewState,
                    ViewState,
                    Refs,
                    ServerContexts,
                    ClientContexts,
                    PropsT,
                    Params,
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
                      [NewCarryForward, ...ServerContexts],
                      ClientContexts,
                      PropsT,
                      Params,
                      JayComponentCore<
                          PropsT,
                          Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                      >
                  >;

                  withFastRender<NewCarryForward extends object>(
                      fastRender: RenderFast<ServerContexts, PropsT, ViewState, NewCarryForward>,
                  ): Builder<
                      'InteractiveRender',
                      StaticViewState,
                      Partial<ViewState>,
                      Refs,
                      ServerContexts,
                      [Signals<NewCarryForward>, ...ClientContexts],
                      PropsT,
                      Params,
                      JayComponentCore<PropsT, Partial<ViewState>>
                  >;

                  withInteractive(
                      comp: ComponentConstructor<PropsT, Refs, ViewState, ClientContexts, CompCore>,
                  ): Builder<
                      'Done',
                      StaticViewState,
                      ViewState,
                      Refs,
                      ServerContexts,
                      ClientContexts,
                      PropsT,
                      Params,
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
                    CompCore
                > & {
                    withFastRender<NewCarryForward extends object>(
                        fastRender: RenderFast<ServerContexts, PropsT, ViewState, NewCarryForward>,
                    ): Builder<
                        'InteractiveRender',
                        StaticViewState,
                        Partial<ViewState>,
                        Refs,
                        ServerContexts,
                        [Signals<NewCarryForward>, ...ClientContexts],
                        PropsT,
                        Params,
                        JayComponentCore<PropsT, Partial<ViewState>>
                    >;

                    withInteractive(
                        comp: ComponentConstructor<
                            PropsT,
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
                      CompCore
                  > & {
                      withInteractive(
                          comp: ComponentConstructor<
                              PropsT,
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
            CompCore
        >
{
    serverContexts: ContextMarkers<ServerContexts> = [] as ContextMarkers<ServerContexts>;
    clientContexts: ContextMarkers<ClientContexts> = [] as ContextMarkers<ClientContexts>;
    loadParams: LoadParams<ServerContexts, Params>;
    slowlyRender: RenderSlowly<ServerContexts, PropsT, StaticViewState, CarryForward>;
    fastRender: RenderFast<ServerContexts, PropsT, ViewState, CarryForward>;
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
            CompCore
        >;
    }

    withSlowlyRender<NewStaticViewState extends Partial<ViewState>, NewCarryForward extends object>(
        slowlyRender: RenderSlowly<ServerContexts, PropsT, NewStaticViewState, NewCarryForward>,
    ): Builder<
        'FastRender',
        NewStaticViewState,
        Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
        Refs,
        [NewCarryForward, ...ServerContexts],
        ClientContexts,
        PropsT,
        Params,
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
            [NewCarryForward, ...ServerContexts],
            ClientContexts,
            PropsT,
            Params,
            JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
        >;
    }

    withFastRender<NewCarryForward extends object>(
        fastRender: RenderFast<ServerContexts, PropsT, ViewState, NewCarryForward>,
    ): Builder<
        'InteractiveRender',
        StaticViewState,
        Partial<ViewState>,
        Refs,
        ServerContexts,
        [Signals<NewCarryForward>, ...ClientContexts],
        PropsT,
        Params,
        JayComponentCore<PropsT, Partial<ViewState>>
    > {
        this.fastRender = fastRender as unknown as RenderFast<
            ServerContexts,
            PropsT,
            ViewState,
            CarryForward
        >;
        return this as unknown as Builder<
            'InteractiveRender',
            StaticViewState,
            ViewState,
            Refs,
            ServerContexts,
            [Signals<NewCarryForward>, ...ClientContexts],
            PropsT,
            Params,
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
            CompCore
        >;
    }
}

export function makeJayStackComponent<Render extends JayContract<any, any>>() {
    return new BuilderImplementation() as unknown as Builder<
        'Props',
        object,
        ExtractViewState<Render>,
        ExtractRefs<Render>,
        [],
        [],
        {},
        {},
        JayComponentCore<object, ExtractViewState<Render>>
    >;
}
