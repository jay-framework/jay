import { ComponentConstructor, ContextMarkers, JayComponentCore } from '@jay-framework/component';
import {
    JayContract,
    ExtractRefs,
    ExtractViewState,
    ExtractSlowViewState,
    ExtractFastViewState,
    ExtractInteractiveViewState,
} from '@jay-framework/runtime';
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
    Refs extends object,
    SlowVS extends object,
    FastVS extends object,
    InteractiveVS extends object,
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CompCore extends JayComponentCore<PropsT, InteractiveVS>,
> = State extends 'Props'
    ? JayStackComponentDefinition<
          Refs,
          SlowVS,
          FastVS,
          InteractiveVS,
          Services,
          Contexts,
          PropsT,
          Params,
          CompCore
      > & {
          withProps<NewPropsT extends object>(): Builder<
              'Services',
              Refs,
              SlowVS,
              FastVS,
              InteractiveVS,
              Services,
              Contexts,
              NewPropsT,
              Params,
              JayComponentCore<NewPropsT, InteractiveVS>
          >;
      }
    : State extends 'Services'
      ? JayStackComponentDefinition<
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
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
                Refs,
                SlowVS,
                FastVS,
                InteractiveVS,
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
                Refs,
                SlowVS,
                FastVS,
                InteractiveVS,
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
                Refs,
                SlowVS,
                FastVS,
                InteractiveVS,
                Services,
                Contexts,
                PropsT & NewParams,
                NewParams,
                CompCore
            >;

            withSlowlyRender<
                NewCarryForward extends object
            >(
                slowlyRender: RenderSlowly<Services, PropsT, SlowVS, NewCarryForward>,
            ): Builder<
                'FastRender',
                Refs,
                SlowVS,
                FastVS,
                InteractiveVS,
                [NewCarryForward, ...Services],
                Contexts,
                PropsT,
                Params,
                JayComponentCore<
                    PropsT,
                    InteractiveVS
                >
            >;

            withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
            ): Builder<
                'InteractiveRender',
                Refs,
                SlowVS,
                FastVS,
                InteractiveVS,
                Services,
                [Signals<NewCarryForward>, ...Contexts],
                PropsT,
                Params,
                JayComponentCore<PropsT, InteractiveVS>
            >;

            withInteractive(
                comp: ComponentConstructor<PropsT, Refs, InteractiveVS, Contexts, CompCore>,
            ): Builder<
                'Done',
                Refs,
                SlowVS,
                FastVS,
                InteractiveVS,
                Services,
                Contexts,
                PropsT,
                Params,
                CompCore
            >;
        }
      : State extends 'Contexts'
        ? JayStackComponentDefinition<
              Refs,
              SlowVS,
              FastVS,
              InteractiveVS,
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
                  Refs,
                  SlowVS,
                  FastVS,
                  InteractiveVS,
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
                  Refs,
                  SlowVS,
                  FastVS,
                  InteractiveVS,
                  Services,
                  Contexts,
                  PropsT & NewParams,
                  NewParams,
                  CompCore
              >;

              withSlowlyRender<
                NewCarryForward extends object
            >(
                  slowlyRender: RenderSlowly<Services, PropsT, SlowVS, NewCarryForward>,
              ): Builder<
                  'FastRender',
                  Refs,
                  SlowVS,
                  FastVS,
                  InteractiveVS,
                  [NewCarryForward, ...Services],
                  Contexts,
                  PropsT,
                  Params,
                  JayComponentCore<
                      PropsT,
                      InteractiveVS
                  >
              >;

              withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
              ): Builder<
                  'InteractiveRender',
                  Refs,
                  SlowVS,
                  FastVS,
                  InteractiveVS,
                  Services,
                  [Signals<NewCarryForward>, ...Contexts],
                  PropsT,
                  Params,
                  JayComponentCore<PropsT, InteractiveVS>
              >;

              withInteractive(
                comp: ComponentConstructor<PropsT, Refs, InteractiveVS, Contexts, CompCore>,
              ): Builder<
                  'Done',
                  Refs,
                  SlowVS,
                  FastVS,
                  InteractiveVS,
                  Services,
                  Contexts,
                  PropsT,
                  Params,
                  CompCore
              >;
          }
        : State extends 'UrlLoader'
          ? JayStackComponentDefinition<
                Refs,
                SlowVS,
                FastVS,
                InteractiveVS,
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
                    Refs,
                    SlowVS,
                    FastVS,
                    InteractiveVS,
                    Services,
                    Contexts,
                    PropsT & NewParams,
                    NewParams,
                    CompCore
                >;

                withSlowlyRender<
                NewCarryForward extends object
            >(
                    slowlyRender: RenderSlowly<
                        Services,
                        PropsT,
                        SlowVS,
                        NewCarryForward
                    >,
                ): Builder<
                    'FastRender',
                    Refs,
                    SlowVS,
                    FastVS,
                    InteractiveVS,
                    [NewCarryForward, ...Services],
                    Contexts,
                    PropsT,
                    Params,
                    JayComponentCore<
                        PropsT,
                        InteractiveVS
                    >
                >;

                withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
                ): Builder<
                    'InteractiveRender',
                    Refs,
                    SlowVS,
                    FastVS,
                    InteractiveVS,
                    Services,
                    [Signals<NewCarryForward>, ...Contexts],
                    PropsT,
                    Params,
                    JayComponentCore<PropsT, InteractiveVS>
                >;

                withInteractive(
                comp: ComponentConstructor<PropsT, Refs, InteractiveVS, Contexts, CompCore>,
                ): Builder<
                    'Done',
                    Refs,
                    SlowVS,
                    FastVS,
                    InteractiveVS,
                    Services,
                    Contexts,
                    PropsT,
                    Params,
                    CompCore
                >;
            }
          : State extends 'SlowlyRender'
            ? JayStackComponentDefinition<
                  Refs,
                  SlowVS,
                  FastVS,
                  InteractiveVS,
                  Services,
                  Contexts,
                  PropsT,
                  Params,
                  CompCore
              > & {
                  withSlowlyRender<
                NewCarryForward extends object
            >(
                      slowlyRender: RenderSlowly<
                          Services,
                          PropsT,
                          SlowVS,
                          NewCarryForward
                      >,
                  ): Builder<
                      'FastRender',
                      Refs,
                      SlowVS,
                      FastVS,
                      InteractiveVS,
                      [NewCarryForward, ...Services],
                      Contexts,
                      PropsT,
                      Params,
                      JayComponentCore<
                          PropsT,
                          InteractiveVS
                      >
                  >;

                  withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
                  ): Builder<
                      'InteractiveRender',
                      Refs,
                      SlowVS,
                      FastVS,
                      InteractiveVS,
                      Services,
                      [Signals<NewCarryForward>, ...Contexts],
                      PropsT,
                      Params,
                      JayComponentCore<PropsT, InteractiveVS>
                  >;

                  withInteractive(
                comp: ComponentConstructor<PropsT, Refs, InteractiveVS, Contexts, CompCore>,
                  ): Builder<
                      'Done',
                      Refs,
                      SlowVS,
                      FastVS,
                      InteractiveVS,
                      Services,
                      Contexts,
                      PropsT,
                      Params,
                      CompCore
                  >;
              }
            : State extends 'FastRender'
              ? JayStackComponentDefinition<
                    Refs,
                    SlowVS,
                    FastVS,
                    InteractiveVS,
                    Services,
                    Contexts,
                    PropsT,
                    Params,
                    CompCore
                > & {
                    withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
                    ): Builder<
                        'InteractiveRender',
                        Refs,
                        SlowVS,
                        FastVS,
                        InteractiveVS,
                        Services,
                        [Signals<NewCarryForward>, ...Contexts],
                        PropsT,
                        Params,
                        JayComponentCore<PropsT, InteractiveVS>
                    >;

                    withInteractive(
                comp: ComponentConstructor<PropsT, Refs, InteractiveVS, Contexts, CompCore>,
                    ): Builder<
                        'Done',
                        Refs,
                        SlowVS,
                        FastVS,
                        InteractiveVS,
                        Services,
                        Contexts,
                        PropsT,
                        Params,
                        CompCore
                    >;
                }
              : State extends 'InteractiveRender'
                ? JayStackComponentDefinition<
                      Refs,
                      SlowVS,
                      FastVS,
                      InteractiveVS,
                      Services,
                      Contexts,
                      PropsT,
                      Params,
                      CompCore
                  > & {
                      withInteractive(
                comp: ComponentConstructor<PropsT, Refs, InteractiveVS, Contexts, CompCore>,
                      ): Builder<
                          'Done',
                          Refs,
                          SlowVS,
                          FastVS,
                          InteractiveVS,
                          Services,
                          Contexts,
                          PropsT,
                          Params,
                          CompCore
                      >;
                  }
                : JayStackComponentDefinition<
                      Refs,
                      SlowVS,
                      FastVS,
                      InteractiveVS,
                      Services,
                      Contexts,
                      PropsT,
                      Params,
                      CompCore
                  >;

class BuilderImplementation<
    Refs extends object,
    SlowVS extends object,
    FastVS extends object,
    InteractiveVS extends object,
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, InteractiveVS>,
> implements
        JayStackComponentDefinition<
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
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
    slowlyRender: RenderSlowly<Services, PropsT, SlowVS, CarryForward>;
    fastRender: RenderFast<Services, PropsT, FastVS, CarryForward>;
    comp: ComponentConstructor<PropsT & CarryForward, Refs, InteractiveVS, Contexts, CompCore>;
    constructor() {}

    withProps<NewPropsT extends object>(): Builder<
        'Services',
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        Services,
        Contexts,
        NewPropsT,
        Params,
        JayComponentCore<NewPropsT, InteractiveVS>
    > {
        return this as unknown as Builder<
            'Services',
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
            Services,
            Contexts,
            NewPropsT,
            Params,
            JayComponentCore<NewPropsT, InteractiveVS>
        >;
    }

    withServices<NewServices extends Array<any>>(
        ...serviceMarkers: ServiceMarkers<NewServices>
    ): Builder<
        'Contexts',
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        NewServices,
        Contexts,
        PropsT,
        Params,
        CompCore
    > {
        this.services = serviceMarkers as ServiceMarkers<Services>;
        return this as unknown as Builder<
            'Contexts',
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
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
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        Services,
        NewContexts,
        PropsT,
        Params,
        CompCore
    > {
        this.contexts = contextMarkers as ContextMarkers<Contexts>;
        return this as unknown as Builder<
            'UrlLoader',
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
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
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        Services,
        Contexts,
        PropsT & NewParams,
        NewParams,
        CompCore
    > {
        this.loadParams = loadParams as unknown as LoadParams<Services, Params>;
        return this as unknown as Builder<
            'SlowlyRender',
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
            Services,
            Contexts,
            PropsT & NewParams,
            NewParams,
            CompCore
        >;
    }

    withSlowlyRender<NewCarryForward extends object>(
        slowlyRender: RenderSlowly<Services, PropsT, SlowVS, NewCarryForward>,
    ): Builder<
        'FastRender',
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        [NewCarryForward, ...Services],
        Contexts,
        PropsT,
        Params,
        JayComponentCore<PropsT, InteractiveVS>
    > {
        this.slowlyRender = slowlyRender as unknown as RenderSlowly<
            Services,
            PropsT,
            SlowVS,
            CarryForward
        >;
        return this as unknown as Builder<
            'FastRender',
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
            [NewCarryForward, ...Services],
            Contexts,
            PropsT,
            Params,
            JayComponentCore<PropsT, InteractiveVS>
        >;
    }

    withFastRender<NewCarryForward extends object>(
                fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
    ): Builder<
        'InteractiveRender',
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        Services,
        [Signals<NewCarryForward>, ...Contexts],
        PropsT,
        Params,
        JayComponentCore<PropsT, InteractiveVS>
    > {
        this.fastRender = fastRender as unknown as RenderFast<
            Services,
            PropsT,
            FastVS,
            CarryForward
        >;
        return this as unknown as Builder<
            'InteractiveRender',
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
            Services,
            [Signals<NewCarryForward>, ...Contexts],
            PropsT,
            Params,
            CompCore
        >;
    }

    withInteractive(
        comp: ComponentConstructor<PropsT & CarryForward, Refs, InteractiveVS, Contexts, CompCore>,
    ): Builder<
        'Done',
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        Services,
        Contexts,
        PropsT,
        Params,
        CompCore
    > {
        this.comp = comp;
        return this as unknown as Builder<
            'Done',
            Refs,
            SlowVS,
            FastVS,
            InteractiveVS,
            Services,
            Contexts,
            PropsT,
            Params,
            CompCore
        >;
    }
}

/**
 * Create a Jay Stack component from a contract.
 * 
 * For .jay-contract files with explicit phase annotations:
 * - SlowViewState: Properties with phase: slow (or default)
 * - FastViewState: Properties with phase: fast  
 * - InteractiveViewState: Properties with phase: fast+interactive
 * 
 * For .jay-html files (backward compatible):
 * - SlowViewState, FastViewState, InteractiveViewState default to `never`
 * 
 * Note: Full type enforcement for phase-specific render functions requires
 * extensive refactoring of the Builder type system. Currently, the phase types
 * are extracted but not yet enforced. See design-log/50 for full implementation plan.
 * 
 * TODO: Add type constraints to withSlowlyRender, withFastRender, withInteractive
 * to enforce that returned/received ViewStates match the phase-specific types.
 */
export function makeJayStackComponent<
    Render extends JayContract<any, any, any, any, any>
>(): Builder<
    'Props',
    ExtractRefs<Render>,
    ExtractSlowViewState<Render>,
    ExtractFastViewState<Render>,
    ExtractInteractiveViewState<Render>,
    [],
    [],
    {},
    {},
    JayComponentCore<object, ExtractInteractiveViewState<Render>>
> {
    // Phase types are now enforced in the builder - inline extractors for type propagation
    return new BuilderImplementation() as unknown as Builder<
        'Props',
        ExtractRefs<Render>,
        ExtractSlowViewState<Render>,
        ExtractFastViewState<Render>,
        ExtractInteractiveViewState<Render>,
        [],
        [],
        {},
        {},
        JayComponentCore<object, ExtractInteractiveViewState<Render>>
    >;
}
