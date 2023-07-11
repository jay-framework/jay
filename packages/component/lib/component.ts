import {
    JayElement,
    JayComponent,
    MountFunc,
    EventEmitter,
    JayEventHandlerWrapper,
    RenderElement,
    createJayContext, useContext, provideContext
} from 'jay-runtime'
import {ValueOrGetter, Getter, Reactive, Setter} from 'jay-reactive'
import {mutableObject} from "jay-mutable"

export type hasProps<PropsT> = {props: Getter<PropsT>}
export type Props<PropsT> = hasProps<PropsT> & {
    [K in keyof PropsT]: Getter<PropsT[K]>
}

export type ViewStateGetters<ViewState> = {
    [K in keyof ViewState]: ViewState[K] | Getter<ViewState[K]>
}

export type UpdatableProps<PropsT> = Props<PropsT> & {
    update(newProps: Partial<PropsT>)
}

export interface JayComponentCore<PropsT, ViewState> {
    render: (props: Props<PropsT>) => ViewStateGetters<ViewState>
}

type ConcreteJayComponent1<PropsT extends object, ViewState, Refs,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState, Refs>> =
    Omit<CompCore, 'render'> & JayComponent<PropsT, ViewState, JayElementT>

type ConcreteJayComponent<PropsT extends object, ViewState, Refs,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState, Refs>> =
    ConcreteJayComponent1<PropsT, ViewState, Refs, CompCore, JayElementT>

interface ComponentContext {
    reactive: Reactive,
    getComponentInstance: () => JayComponent<any, any, any>
    mounts: MountFunc[],
    unmounts: MountFunc[]
}


export const COMPONENT_CONTEXT = createJayContext<ComponentContext>()

function currentComponentContext() {
    return useContext(COMPONENT_CONTEXT);
}

type EffectCleanup = () => void
export function createEffect(effect: () => void | EffectCleanup) {
    let cleanup = undefined;
    let mounted = true;

    const clean = () => {
        if (cleanup !== undefined) {
            cleanup();
            cleanup = undefined;
        }
    }

    currentComponentContext().reactive.createReaction(() => {
        clean();
        cleanup = effect();
    })
    currentComponentContext().unmounts.push(() => {
        mounted = false;
        clean();
    })
    currentComponentContext().mounts.push(() => {
        cleanup = effect();
    })
}

export function createState<T>(value: ValueOrGetter<T>): [get: Getter<T>, set: Setter<T>] {
    return currentComponentContext().reactive.createState(value);
}

export function createMutableState<T extends object>(value: T): Getter<T> {
    let [get, set] = createState(mutableObject(value, true))
    return get
}

export function useReactive(): Reactive {
    return currentComponentContext().reactive;
}
export function createMemo<T>(computation: (prev: T) => T, initialValue?: T): Getter<T> {
    let [value, setValue] = currentComponentContext().reactive.createState(initialValue);
    currentComponentContext().reactive.createReaction(() => {
        setValue(oldValue => computation(oldValue))
    })
    return value
}

export function createEvent<EventType>(eventEffect?: (emitter: EventEmitter<EventType, any>) => void): EventEmitter<EventType, any> {
    let handler;
    let emitter: any = (h) => handler = h;
    emitter.emit = (event: EventType) => handler && handler({event});
    if (eventEffect)
        createEffect(() => eventEffect(emitter));
    return emitter;
}

function materializeViewState<ViewState extends object>(vsValueOrGetter: ViewStateGetters<ViewState>): ViewState {
    let vs = {};
    for (let key in vsValueOrGetter) {
        const value = vsValueOrGetter[key];
        if (typeof value === 'function')
            vs[key as string] = value();
        else
            vs[key as string] = value;
    }
    return vs as ViewState;
}

export function makeJayComponent<PropsT extends object, ViewState extends object, Refs extends object, JayElementT extends JayElement<ViewState, Refs>,
    CompCore extends JayComponentCore<PropsT, ViewState>
    >(
    render: RenderElement<ViewState, Refs, JayElementT>,
    comp: (props: Props<PropsT>, refs: Refs) => CompCore):
      (props: PropsT) => ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT> {

    return (props) => {
        let reactive = new Reactive();
        let mounts: MountFunc[] = [];
        let unmounts: MountFunc[] = [];
        let componentInstance = null;
        let getComponentInstance = () => {
            return componentInstance
        };
        let componentContext = {
            reactive, mounts, unmounts, getComponentInstance
        }
        return provideContext(COMPONENT_CONTEXT, componentContext, () => {
            return reactive.record(() => {
                let propsProxy = makePropsProxy(reactive, props);

                // @ts-ignore
                let eventWrapper: JayEventHandlerWrapper<any, any, any> = (orig, event) => {
                    return reactive.batchReactions(() => orig(event))
                }
                let element: JayElementT = render({} as ViewState, {eventWrapper});

                let coreComp = comp(propsProxy, element.refs); // wrap event listening with batch reactions
                let {render: renderViewState, ...api} = coreComp;

                reactive.createReaction(() => {
                    let viewStateValueOrGetters = renderViewState(propsProxy)
                    let viewState = materializeViewState(viewStateValueOrGetters);
                    element.update(viewState)
                })
                // applyToRefs(refs, element.refs, (func: Function) => (...args) =>
                //     reactive.batchReactions(() => func(...args))
                // );
                let update = (updateProps) => {
                    propsProxy.update(updateProps)
                }
                mounts.push(element.mount)
                unmounts.push(element.unmount)

                let events = {}
                let component = {
                    element,
                    update,
                    mount: () => mounts.forEach(_ => _()),
                    unmount: () => unmounts.forEach(_ => _()),
                    addEventListener: (eventType: string, handler: Function) => events[eventType](handler),
                    removeEventListener: (eventType: string) => events[eventType](undefined)
                }

                // todo validate not overriding main JayComponent APIs
                for (let key in api) {
                    if (typeof api[key] === 'function') {
                        if (api[key].emit) {
                            component[key] = api[key];
                            if (key.indexOf('on') === 0) {
                                let [,,...rest] = key;
                                events[rest.join('')] = api[key];
                            }
                        }
                        else
                            component[key] = (...args) => reactive.batchReactions(() => api[key](...args))
                    }
                    else {
                        component[key] = api[key];
                    }
                }

                return componentInstance = component as unknown as ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT>
            })
        })
    }
}

function makePropsProxy<PropsT extends object>(reactive: Reactive, props: PropsT): UpdatableProps<PropsT> {
    const stateMap = {}

    const [_props, _setProps] = createState(props)

    const update = (newProps: PropsT) => {
        reactive.batchReactions(() => {
            let props = _props();
            for (const prop in newProps) {
                props[prop] = newProps[prop]
                if (!stateMap.hasOwnProperty(prop))
                    stateMap[prop as string] = reactive.createState(newProps[prop])
                else
                    stateMap[prop as string][1](newProps[prop])
            }
        })
    }
    const getter = (obj: PropsT, prop: string | number | symbol) => {
        if (!stateMap.hasOwnProperty(prop))
            stateMap[prop] = reactive.createState(obj[prop])
        return stateMap[prop][0];
    }
    return new Proxy(props, {
        get: function(obj, prop) {
            if (prop === 'update')
                return update
            else if (prop === 'props')
                return _props
            else
                return getter(obj, prop);
        }
    }) as UpdatableProps<PropsT>
}

export const forTesting = {
    makePropsProxy
}
