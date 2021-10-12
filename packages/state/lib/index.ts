import {JayElement, JayComponent, ContextStack} from 'jay-runtime'
import {Getter, Reactive} from './reactive'

export type Props<PropsT> = {
    [K in keyof PropsT]: Getter<PropsT[K]>
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
    render: () => ViewState
}

type ConcreteJayComponent1<PropsT, ViewState,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState>> =
    Omit<CompCore, 'render'> & JayComponent<PropsT, ViewState, JayElementT>

type ConcreteJayComponent<PropsT, ViewState,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState>,
    CJC extends ConcreteJayComponent1<PropsT, ViewState, CompCore, JayElementT>> = {
    [K in keyof CJC]: CJC[K] extends EventEmitter<infer T, infer F> ? F : CJC[K]
}
export function makeJayComponent<PropsT, ViewState, JayElementT extends JayElement<ViewState>,
    CompCore extends JayComponentCore<PropsT, ViewState>
    >(
    render: (vs: ViewState) => JayElementT,
    comp: (props: Props<PropsT>, element: JayElementT) => CompCore): ConcreteJayComponent<PropsT, ViewState, CompCore, JayElementT, ConcreteJayComponent1<PropsT, ViewState, CompCore, JayElementT>> {

}

const reactiveContextStack = new ContextStack<Reactive>();

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
    reactiveContextStack,
    makePropsProxy
}
