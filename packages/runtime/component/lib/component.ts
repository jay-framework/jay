import {
    JayElement,
    JayComponent,
    JayEventHandlerWrapper,
    withContext,
    ContextMarker,
    useContext,
    PreRenderElement,
    RenderElement,
    MountFunc, VIEW_STATE_CHANGE_EVENT,
} from '@jay-framework/runtime';
import { Getter, mkReactive, Reactive } from '@jay-framework/reactive';
import { JSONPatch } from '@jay-framework/json-patch';
import { HTMLElement } from 'node-html-parser';
import { createSignal } from './hooks';
import { COMPONENT_CONTEXT, ComponentContext } from './component-contexts';
import { CONTEXT_REACTIVE_SYMBOL_CONTEXT } from './context-api';

export type Patcher<T> = (...patch: JSONPatch) => void;
export type hasProps<PropsT> = { props: Getter<PropsT> };
export type Props<PropsT> = hasProps<PropsT> & {
    [K in keyof PropsT]: K extends string ? Getter<PropsT[K]> : PropsT[K];
};

export type ViewStateGetters<ViewState> = {
    [K in keyof ViewState]: ViewState[K] | Getter<ViewState[K]>;
};

export type UpdatableProps<PropsT> = Props<PropsT> & {
    update(newProps: PropsT);
};

export interface JayComponentCore<PropsT, ViewState> {
    render: () => ViewStateGetters<ViewState>;
}

type ConcreteJayComponent1<
    PropsT extends object,
    ViewState,
    Refs,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState, Refs>,
> = Omit<CompCore, 'render'> & JayComponent<PropsT, ViewState, JayElementT>;

export type ConcreteJayComponent<
    PropsT extends object,
    ViewState,
    Refs,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState, Refs>,
> = ConcreteJayComponent1<PropsT, ViewState, Refs, CompCore, JayElementT>;

export function materializeViewState<ViewState extends object>(
    vsValueOrGetter: ViewStateGetters<ViewState>,
): ViewState {
    let vs = {};
    for (let key in vsValueOrGetter) {
        let value = vsValueOrGetter[key];
        if (typeof value === 'function') value = value();
        vs[key as string] = value;
    }
    return vs as ViewState;
}

export type ComponentConstructor<
    PropsT extends object,
    Refs extends object,
    ViewState extends object,
    Contexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> = (props: Props<PropsT>, refs: Refs, ...contexts: Contexts) => CompCore;

export type ContextMarkers<T extends any[]> = {
    [K in keyof T]: ContextMarker<T[K]>;
};

function renderWithContexts<
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
>(
    provideContexts: [ContextMarker<any>, any][],
    render: RenderElement<ViewState, Refs, JayElementT>,
    viewState: ViewState,
    index: number = 0,
): JayElementT {
    if (provideContexts.length > index) {
        let [marker, context] = provideContexts[0];
        return withContext(marker, context, () =>
            renderWithContexts(provideContexts, render, viewState, index + 1),
        );
    }
    return render(viewState);
}

function mkMounts(
    componentContext: ComponentContext,
    element: JayElement<any, any>,
): [MountFunc, MountFunc] {
    const [mounted, setMounted] = componentContext.mountedSignal;

    componentContext.reactive.createReaction(() => {
        if (mounted) element.mount();
        else element.unmount();
    });

    const mount = () => {
        componentContext.reactive.enable();
        componentContext.reactive.batchReactions(() => setMounted(true));
    };
    const unmount = () => {
        componentContext.reactive.batchReactions(() => setMounted(false));
        componentContext.reactive.disable();
    };
    return [mount, unmount];
}

export function makeJayComponent<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    Contexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    preRender: PreRenderElement<ViewState, Refs, JayElementT>,
    comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
    ...contextMarkers: ContextMarkers<Contexts>
): (props: PropsT) => ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT> {
    return (props) => {
        let componentInstance = null;
        const getComponentInstance = () => {
            return componentInstance;
        };
        const reactive = mkReactive();
        const componentContext: ComponentContext = {
            mountedSignal: reactive.createSignal(true),
            reactive,
            provideContexts: [],
            getComponentInstance,
        };
        return withContext(COMPONENT_CONTEXT, componentContext, () => {
            let propsProxy = makePropsProxy(componentContext.reactive, props);

            let eventWrapper: JayEventHandlerWrapper<any, any, any> = (orig, event) => {
                return componentContext.reactive.batchReactions(() => orig(event));
            };
            let [refs, render] = preRender({ eventWrapper });

            let contexts: Contexts = contextMarkers.map((marker) => {
                const context = useContext(marker);
                reactive.enablePairing(context[CONTEXT_REACTIVE_SYMBOL_CONTEXT]);
                return context;
            }) as Contexts;
            let coreComp = comp(propsProxy, refs, ...contexts); // wrap event listening with batch reactions
            let { render: renderViewState, ...api } = coreComp;
            let element: JayElementT;

            componentContext.provideContexts.forEach(
                ([marker, context]) =>
                    context[CONTEXT_REACTIVE_SYMBOL_CONTEXT] &&
                    reactive.enablePairing(context[CONTEXT_REACTIVE_SYMBOL_CONTEXT]),
            );

            // Track current ViewState
            let currentViewState: ViewState;
            let viewStateChangeListener: Function | undefined;

            componentContext.reactive.createReaction(() => {
                let viewStateValueOrGetters = renderViewState();
                let viewState = materializeViewState(viewStateValueOrGetters);
                currentViewState = viewState;

                if (!element)
                    element = renderWithContexts(
                        componentContext.provideContexts,
                        render,
                        viewState,
                    );
                else element.update(viewState);

                // Notify viewStateChange listener (uses JayEvent format for consistency)
                viewStateChangeListener?.({ event: viewState, viewState, coordinate: [] });
            });
            const [mount, unmount] = mkMounts(componentContext, element);
            let update = (updateProps) => {
                propsProxy.update(updateProps);
            };

            // Event handlers - viewStateChange is built-in, others come from component API
            let events: Record<string, (handler: Function | undefined) => void> = {
                [VIEW_STATE_CHANGE_EVENT]: (handler) => {
                    viewStateChangeListener = handler;
                },
            };
            let component: any = {
                element,
                update,
                mount,
                unmount,
                addEventListener: (eventType: string, handler: Function) =>
                    events[eventType]?.(handler),
                removeEventListener: (eventType: string) => events[eventType]?.(undefined),
            };

            // todo validate not overriding main JayComponent APIs
            for (let key in api) {
                if (typeof api[key] === 'function') {
                    if (api[key].emit) {
                        component[key] = api[key];
                        if (key.indexOf('on') === 0) {
                            let [, , ...rest] = key;
                            events[rest.join('')] = api[key];
                        }
                    } else
                        component[key] = (...args) =>
                            componentContext.reactive.batchReactions(() => api[key](...args));
                } else {
                    component[key] = api[key];
                }
            }

            // Expose ViewState getter
            Object.defineProperty(component, 'viewState', {
                get: () => currentViewState,
                enumerable: false,
                configurable: true,
            });

            return (componentInstance = component as unknown as ConcreteJayComponent<
                PropsT,
                ViewState,
                Refs,
                CompCore,
                JayElementT
            >);
        });
    };
}

export type JsxNode = HTMLElement;

export type JayTsxComponentConstructor<
    PropsT extends object,
    CompT extends { render: () => JsxNode },
> = (props: Props<PropsT>) => CompT;

export function makeJayTsxComponent<PropsT extends object, CompT extends { render: () => JsxNode }>(
    comp: JayTsxComponentConstructor<PropsT, CompT>,
): JayComponent<PropsT, any, any> {
    return {} as JayComponent<PropsT, any, any>;
}

export function makePropsProxy<PropsT extends object>(
    reactive: Reactive,
    props: PropsT,
): UpdatableProps<PropsT> {
    const stateMap = {};

    const [_props, _setProps] = createSignal(props);

    const update = (newProps: PropsT) => {
        reactive.batchReactions(() => {
            _setProps(newProps);
            for (const prop in newProps) {
                if (!stateMap.hasOwnProperty(prop))
                    stateMap[prop as string] = reactive.createSignal(newProps[prop]);
                else stateMap[prop as string][1](newProps[prop]);
            }
        });
    };
    const getter = (obj: PropsT, prop: string | number | symbol) => {
        if (!stateMap.hasOwnProperty(prop)) stateMap[prop] = reactive.createSignal(obj[prop]);
        return stateMap[prop][0];
    };
    return new Proxy(props, {
        get: function (obj, prop) {
            if (prop === 'update') return update;
            else if (prop === 'props') return _props;
            else return getter(obj, prop);
        },
    }) as UpdatableProps<PropsT>;
}

export const forTesting = {
    makePropsProxy,
};
