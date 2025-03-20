import {ComponentConstructor, ContextMarkers, JayComponentCore, makeJayComponent, Props} from "jay-component";
import {PreRenderElement} from "jay-runtime";


export interface CompositePartComponent<
    PropsT extends object,
    Refs extends object,
    ViewState extends object,
    Contexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, ViewState>> {
    comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
    contextMarkers: ContextMarkers<Contexts>[],
    viewStateKey: string
}

export function makeCompositeJayComponent<
    PropsT extends object,
    ViewState extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>
>(
    preRender: PreRenderElement<any, any, any>,
    defaultViewState: ViewState,
    parts: Array<CompositePartComponent<any, any, any, any, any>>
)  {
    const comp = (props: Props<any>, refs, ...contexts): CompCore => {

        const instances: Array<[string, JayComponentCore<any, any>]> = parts.map(part => {
            return [part.viewStateKey, part.comp(props, refs, contexts.splice(0, part.contextMarkers.length))]
        })

        return {
            render: () => {
                let viewState = defaultViewState;
                instances.forEach(([key, instance]) =>
                    viewState = {...viewState, ...instance.render()})
                return viewState;
            }
        } as CompCore
    }

    const contextMarkers = parts.reduce((cm, part) => {
        return [...cm, ...part.contextMarkers]
    }, [])

    return makeJayComponent(preRender, comp, ...contextMarkers)
}