import {JayElement, JayComponent, ContextStack, MountFunc} from 'jay-runtime'
import {ValueOrGetter, Getter, Reactive, Setter} from 'jay-reactive'
import {applyToRefs, refsRecorder} from "./refs-recorder";
import {monitorEventLoopDelay} from "perf_hooks";

export type Props<PropsT> = {
    [K in keyof PropsT]: Getter<PropsT[K]>
}

export type ViewStateGetters<ViewState> = {
    [K in keyof ViewState]: ViewState[K] | Getter<ViewState[K]>
}

export type UpdatableProps<PropsT> = Props<PropsT> & {
    update(newProps: Partial<PropsT>)
}

class EventEmitter<T, F extends (t: T) => void> {
    handler?: F

    emit(t: T): void {
        if (this.handler)
            this.handler(t);
    }
    on(handler: F) {
        this.handler = handler;
    }
}

export interface JayComponentCore<PropsT, ViewState> {
    render: (props: Props<PropsT>) => ViewStateGetters<ViewState>
}

type ConcreteJayComponent1<PropsT extends object, ViewState, Refs,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState, Refs>> =
    Omit<CompCore, 'render'> & JayComponent<PropsT, ViewState, JayElementT>

type ConcreteJayComponent2<PropsT extends object, ViewState, Refs,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState, Refs>,
    CJC extends ConcreteJayComponent1<PropsT, ViewState, Refs, CompCore, JayElementT>> = {
    [K in keyof CJC]: CJC[K] extends EventEmitter<infer T, infer F> ? F : CJC[K]
}

type ConcreteJayComponent<PropsT extends object, ViewState, Refs,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState, Refs>> =
    ConcreteJayComponent2<PropsT, ViewState, Refs, CompCore, JayElementT, ConcreteJayComponent1<PropsT, ViewState, Refs, CompCore, JayElementT>>

interface ComponentContext {
    reactive: Reactive,
    mounts: MountFunc[],
    unmounts: MountFunc[]
}
const componentContextStack = new ContextStack<ComponentContext>();

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

    componentContextStack.current().reactive.createReaction(() => {
        clean();
        cleanup = effect();
    })
    componentContextStack.current().unmounts.push(() => {
        mounted = false;
        clean();
    })
    componentContextStack.current().mounts.push(() => {
        cleanup = effect();
    })
}

export function createState<T>(value: ValueOrGetter<T>): [get: Getter<T>, set: Setter<T>] {
    return componentContextStack.current().reactive.createState(value);
}

export function createMemo<T>(computation: (prev: T) => T, initialValue?: T): Getter<T> {
    let value = initialValue
    componentContextStack.current().reactive.createReaction(() => {
        value = computation(value)
    })
    return () => value
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
    render: (vs: ViewState) => JayElementT,
    comp: (props: Props<PropsT>, refs: Refs) => CompCore):
      (props: PropsT) => ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT> {

    return (props) => {
        let reactive = new Reactive();
        let mounts: MountFunc[] = [];
        let unmounts: MountFunc[] = [];
        let componentContext = {
            reactive, mounts, unmounts
        }
        return componentContextStack.doWithContext(componentContext, () => {
            return reactive.record(() => {
                let propsProxy = makePropsProxy(reactive, props);
                let refs: Refs = refsRecorder()

                let coreComp = comp(propsProxy, refs);
                let {render: renderViewState, ...api} = coreComp;

                let element: JayElementT;
                reactive.createReaction(() => {
                    let viewStateValueOrGetters = renderViewState(propsProxy)
                    let viewState = materializeViewState(viewStateValueOrGetters);
                    if (element)
                        element.update(viewState)
                    else
                        element = render(viewState)
                })
                applyToRefs(refs, element.refs);
                let update = (updateProps) => {
                    propsProxy.update(updateProps)
                }
                mounts.push(element.mount)
                unmounts.push(element.unmount)
                return {
                    element,
                    update,
                    mount: () => mounts.forEach(_ => _()),
                    unmount: () => unmounts.forEach(_ => _()),
                    ...api
                } as unknown as ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT>
            })
        })
    }
}

function makePropsProxy<PropsT extends object>(reactive: Reactive, props: PropsT): UpdatableProps<PropsT> {
    const stateMap = {}

    const update = (obj: PropsT) => {
        for (const prop in obj) {
            if (!stateMap.hasOwnProperty(prop))
                stateMap[prop as string] = reactive.createState(obj[prop])
            else
                stateMap[prop as string][1](obj[prop])
        }
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
            else
                return getter(obj, prop);
        }
    }) as UpdatableProps<PropsT>
}

export const forTesting = {
    reactiveContextStack: componentContextStack,
    makePropsProxy
}
