import { ComponentConstructor, ContextMarkers, JayComponentCore } from '@jay-framework/component';
import { JayContract, ExtractRefs, ExtractViewState } from '@jay-framework/runtime';
import { JayElement } from '@jay-framework/runtime';
import {
    JayStackComponentDefinition,
    LoadParams,
    RenderFast,
    RenderSlowly,
    UrlParams,
    ServiceMarkers,
} from './jay-stack-types';
import { Getter, Setter } from '@jay-framework/reactive';

type BuilderStates =
    | 'Props' // requires setting the props type. Next allowed states are "Services", "Contexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'Services' // allowing to set services. Next allowed states are "Contexts", "UrlLoader", "Slowly", "Fast", "Interactive"
    | 'Contexts' // allowing to set contexts. Next allowed states are "UrlLoader", "Slowly", "Fast", "Interactive"
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
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> = State extends 'Props'
    ? JayStackComponentDefinition<
          StaticViewState,
          ViewState,
          Refs,
          Services,
          Contexts,
          PropsT,
          Params,
          CompCore
      > & {
          withProps<NewPropsT extends object>(): Builder<
              'Services',
              StaticViewState,
              ViewState,
              Refs,
              Services,
              Contexts,
              NewPropsT,
              Params,
              JayComponentCore<NewPropsT, ViewState>
          >;
      }
    : State extends 'Services'
      ? JayStackComponentDefinition<
            StaticViewState,
            ViewState,
            Refs,
            Services,
            Contexts,
            PropsT,
            Params,
            CompCore
        > & {
            withServices<NewServices extends Array<any>>(
                ...serviceMarkers: ServiceMarkers<NewServices>
            ): Builder<
                'Contexts',
                StaticViewState,
                ViewState,
                Refs,
                NewServices,
                Contexts,
                PropsT,
                Params,
                CompCore
            >;
            withContexts<NewContexts extends Array<any>>(
                ...contextMarkers: ContextMarkers<NewContexts>
            ): Builder<
                'UrlLoader',
                StaticViewState,
                ViewState,
                Refs,
                Services,
                NewContexts,
                PropsT,
                Params,
                CompCore
            >;

            withLoadParams<NewParams extends UrlParams>(
                loadParams: LoadParams<Services, NewParams>,
            ): Builder<
                'SlowlyRender',
                StaticViewState,
                ViewState,
                Refs,
                Services,
                Contexts,
                PropsT & NewParams,
                NewParams,
                CompCore
            >;

            withSlowlyRender<
                NewStaticViewState extends Partial<ViewState>,
                NewCarryForward extends object,
            >(
                slowlyRender: RenderSlowly<Services, PropsT, NewStaticViewState, NewCarryForward>,
            ): Builder<
                'FastRender',
                NewStaticViewState,
                Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                Refs,
                [NewCarryForward, ...Services],
                Contexts,
                PropsT,
                Params,
                JayComponentCore<
                    PropsT,
                    Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                >
            >;

            withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<Services, PropsT, ViewState, NewCarryForward>,
            ): Builder<
                'InteractiveRender',
                StaticViewState,
                Partial<ViewState>,
                Refs,
                Services,
                [Signals<NewCarryForward>, ...Contexts],
                PropsT,
                Params,
                JayComponentCore<PropsT, Partial<ViewState>>
            >;

            withInteractive(
                comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
            ): Builder<
                'Done',
                StaticViewState,
                ViewState,
                Refs,
                Services,
                Contexts,
                PropsT,
                Params,
                CompCore
            >;
        }
      : State extends 'Contexts'
        ? JayStackComponentDefinition<
              StaticViewState,
              ViewState,
              Refs,
              Services,
              Contexts,
              PropsT,
              Params,
              CompCore
          > & {
              withContexts<NewContexts extends Array<any>>(
                  ...contextMarkers: ContextMarkers<NewContexts>
              ): Builder<
                  'UrlLoader',
                  StaticViewState,
                  ViewState,
                  Refs,
                  Services,
                  NewContexts,
                  PropsT,
                  Params,
                  CompCore
              >;

              withLoadParams<NewParams extends UrlParams>(
                  loadParams: LoadParams<Services, NewParams>,
              ): Builder<
                  'SlowlyRender',
                  StaticViewState,
                  ViewState,
                  Refs,
                  Services,
                  Contexts,
                  PropsT & NewParams,
                  NewParams,
                  CompCore
              >;

              withSlowlyRender<
                  NewStaticViewState extends Partial<ViewState>,
                  NewCarryForward extends object,
              >(
                  slowlyRender: RenderSlowly<Services, PropsT, NewStaticViewState, NewCarryForward>,
              ): Builder<
                  'FastRender',
                  NewStaticViewState,
                  Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                  Refs,
                  [NewCarryForward, ...Services],
                  Contexts,
                  PropsT,
                  Params,
                  JayComponentCore<
                      PropsT,
                      Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                  >
              >;

              withFastRender<NewCarryForward extends object>(
                  fastRender: RenderFast<Services, PropsT, ViewState, NewCarryForward>,
              ): Builder<
                  'InteractiveRender',
                  StaticViewState,
                  Partial<ViewState>,
                  Refs,
                  Services,
                  [Signals<NewCarryForward>, ...Contexts],
                  PropsT,
                  Params,
                  JayComponentCore<PropsT, Partial<ViewState>>
              >;

              withInteractive(
                  comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
              ): Builder<
                  'Done',
                  StaticViewState,
                  ViewState,
                  Refs,
                  Services,
                  Contexts,
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
                Services,
                Contexts,
                PropsT,
                Params,
                CompCore
            > & {
                withLoadParams<NewParams extends UrlParams>(
                    loadParams: LoadParams<Services, NewParams>,
                ): Builder<
                    'SlowlyRender',
                    StaticViewState,
                    ViewState,
                    Refs,
                    Services,
                    Contexts,
                    PropsT & NewParams,
                    NewParams,
                    CompCore
                >;

                withSlowlyRender<
                    NewStaticViewState extends Partial<ViewState>,
                    NewCarryForward extends object,
                >(
                    slowlyRender: RenderSlowly<
                        Services,
                        PropsT,
                        NewStaticViewState,
                        NewCarryForward
                    >,
                ): Builder<
                    'FastRender',
                    NewStaticViewState,
                    Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                    Refs,
                    [NewCarryForward, ...Services],
                    Contexts,
                    PropsT,
                    Params,
                    JayComponentCore<
                        PropsT,
                        Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                    >
                >;

                withFastRender<NewCarryForward extends object>(
                    fastRender: RenderFast<Services, PropsT, ViewState, NewCarryForward>,
                ): Builder<
                    'InteractiveRender',
                    StaticViewState,
                    Partial<ViewState>,
                    Refs,
                    Services,
                    [Signals<NewCarryForward>, ...Contexts],
                    PropsT,
                    Params,
                    JayComponentCore<PropsT, Partial<ViewState>>
                >;

                withInteractive(
                    comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
                ): Builder<
                    'Done',
                    StaticViewState,
                    ViewState,
                    Refs,
                    Services,
                    Contexts,
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
                  Services,
                  Contexts,
                  PropsT,
                  Params,
                  CompCore
              > & {
                  withSlowlyRender<
                      NewStaticViewState extends Partial<ViewState>,
                      NewCarryForward extends object,
                  >(
                      slowlyRender: RenderSlowly<
                          Services,
                          PropsT,
                          NewStaticViewState,
                          NewCarryForward
                      >,
                  ): Builder<
                      'FastRender',
                      NewStaticViewState,
                      Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
                      Refs,
                      [NewCarryForward, ...Services],
                      Contexts,
                      PropsT,
                      Params,
                      JayComponentCore<
                          PropsT,
                          Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>
                      >
                  >;

                  withFastRender<NewCarryForward extends object>(
                      fastRender: RenderFast<Services, PropsT, ViewState, NewCarryForward>,
                  ): Builder<
                      'InteractiveRender',
                      StaticViewState,
                      Partial<ViewState>,
                      Refs,
                      Services,
                      [Signals<NewCarryForward>, ...Contexts],
                      PropsT,
                      Params,
                      JayComponentCore<PropsT, Partial<ViewState>>
                  >;

                  withInteractive(
                      comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
                  ): Builder<
                      'Done',
                      StaticViewState,
                      ViewState,
                      Refs,
                      Services,
                      Contexts,
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
                    Services,
                    Contexts,
                    PropsT,
                    Params,
                    CompCore
                > & {
                    withFastRender<NewCarryForward extends object>(
                        fastRender: RenderFast<Services, PropsT, ViewState, NewCarryForward>,
                    ): Builder<
                        'InteractiveRender',
                        StaticViewState,
                        Partial<ViewState>,
                        Refs,
                        Services,
                        [Signals<NewCarryForward>, ...Contexts],
                        PropsT,
                        Params,
                        JayComponentCore<PropsT, Partial<ViewState>>
                    >;

                    withInteractive(
                        comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
                    ): Builder<
                        'Done',
                        StaticViewState,
                        ViewState,
                        Refs,
                        Services,
                        Contexts,
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
                      Services,
                      Contexts,
                      PropsT,
                      Params,
                      CompCore
                  > & {
                      withInteractive(
                          comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
                      ): Builder<
                          'Done',
                          StaticViewState,
                          ViewState,
                          Refs,
                          Services,
                          Contexts,
                          PropsT,
                          Params,
                          CompCore
                      >;
                  }
                : JayStackComponentDefinition<
                      StaticViewState,
                      ViewState,
                      Refs,
                      Services,
                      Contexts,
                      PropsT,
                      Params,
                      CompCore
                  >;

class BuilderImplementation<
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> implements
        JayStackComponentDefinition<
            StaticViewState,
            ViewState,
            Refs,
            Services,
            Contexts,
            PropsT,
            Params,
            CompCore
        >
{
    services: ServiceMarkers<Services> = [] as ServiceMarkers<Services>;
    contexts: ContextMarkers<Contexts> = [] as ContextMarkers<Contexts>;
    loadParams: LoadParams<Services, Params>;
    slowlyRender: RenderSlowly<Services, PropsT, StaticViewState, CarryForward>;
    fastRender: RenderFast<Services, PropsT, ViewState, CarryForward>;
    comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, Contexts, CompCore>;
    constructor() {}

    withProps<NewPropsT extends object>(): Builder<
        'Services',
        StaticViewState,
        ViewState,
        Refs,
        Services,
        Contexts,
        NewPropsT,
        Params,
        JayComponentCore<NewPropsT, ViewState>
    > {
        return this as unknown as Builder<
            'Services',
            StaticViewState,
            ViewState,
            Refs,
            Services,
            Contexts,
            NewPropsT,
            Params,
            JayComponentCore<NewPropsT, ViewState>
        >;
    }

    withServices<NewServices extends Array<any>>(
        ...serviceMarkers: ServiceMarkers<NewServices>
    ): Builder<
        'Contexts',
        StaticViewState,
        ViewState,
        Refs,
        NewServices,
        Contexts,
        PropsT,
        Params,
        CompCore
    > {
        this.services = serviceMarkers as ServiceMarkers<Services>;
        return this as unknown as Builder<
            'Contexts',
            StaticViewState,
            ViewState,
            Refs,
            NewServices,
            Contexts,
            PropsT,
            Params,
            CompCore
        >;
    }

    withContexts<NewContexts extends Array<any>>(
        ...contextMarkers: ContextMarkers<NewContexts>
    ): Builder<
        'UrlLoader',
        StaticViewState,
        ViewState,
        Refs,
        Services,
        NewContexts,
        PropsT,
        Params,
        CompCore
    > {
        this.contexts = contextMarkers as ContextMarkers<Contexts>;
        return this as unknown as Builder<
            'UrlLoader',
            StaticViewState,
            ViewState,
            Refs,
            Services,
            NewContexts,
            PropsT,
            Params,
            CompCore
        >;
    }

    withLoadParams<NewParams extends UrlParams>(
        loadParams: LoadParams<Services, NewParams>,
    ): Builder<
        'SlowlyRender',
        StaticViewState,
        ViewState,
        Refs,
        Services,
        Contexts,
        PropsT & NewParams,
        NewParams,
        CompCore
    > {
        this.loadParams = loadParams as unknown as LoadParams<Services, Params>;
        return this as unknown as Builder<
            'SlowlyRender',
            StaticViewState,
            ViewState,
            Refs,
            Services,
            Contexts,
            PropsT & NewParams,
            NewParams,
            CompCore
        >;
    }

    withSlowlyRender<NewStaticViewState extends Partial<ViewState>, NewCarryForward extends object>(
        slowlyRender: RenderSlowly<Services, PropsT, NewStaticViewState, NewCarryForward>,
    ): Builder<
        'FastRender',
        NewStaticViewState,
        Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
        Refs,
        [NewCarryForward, ...Services],
        Contexts,
        PropsT,
        Params,
        JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
    > {
        this.slowlyRender = slowlyRender as unknown as RenderSlowly<
            Services,
            PropsT,
            StaticViewState,
            CarryForward
        >;
        return this as unknown as Builder<
            'FastRender',
            NewStaticViewState,
            Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
            Refs,
            [NewCarryForward, ...Services],
            Contexts,
            PropsT,
            Params,
            JayComponentCore<PropsT, Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>>
        >;
    }

    withFastRender<NewCarryForward extends object>(
        fastRender: RenderFast<Services, PropsT, ViewState, NewCarryForward>,
    ): Builder<
        'InteractiveRender',
        StaticViewState,
        Partial<ViewState>,
        Refs,
        Services,
        [Signals<NewCarryForward>, ...Contexts],
        PropsT,
        Params,
        JayComponentCore<PropsT, Partial<ViewState>>
    > {
        this.fastRender = fastRender as unknown as RenderFast<
            Services,
            PropsT,
            ViewState,
            CarryForward
        >;
        return this as unknown as Builder<
            'InteractiveRender',
            StaticViewState,
            ViewState,
            Refs,
            Services,
            [Signals<NewCarryForward>, ...Contexts],
            PropsT,
            Params,
            CompCore
        >;
    }

    withInteractive(
        comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, Contexts, CompCore>,
    ): Builder<
        'Done',
        StaticViewState,
        ViewState,
        Refs,
        Services,
        Contexts,
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
            Services,
            Contexts,
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
