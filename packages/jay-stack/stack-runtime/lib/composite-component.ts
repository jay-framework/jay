import {
    JayComponentCore,
    makeJayComponent,
    makePropsProxy,
    materializeViewState,
    Props,
    useReactive,
} from 'jay-component';
import {JayElement, PreRenderElement} from 'jay-runtime';
import {CompositePart} from "./composite-part";

export function makeCompositeJayComponent<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    preRender: PreRenderElement<ViewState, Refs, JayElementT>,
    defaultViewState: ViewState,
    parts: Array<CompositePart>,
) {
    const comp = (props: Props<any>, refs, ...contexts): CompCore => {
        const instances: Array<[string, JayComponentCore<any, any>]> = parts.map((part) => {
            const partRefs = part.key? refs[part.key] : refs;
            let partProps: Props<any>;
            if (part.key) {
                partProps = makePropsProxy(useReactive(), props[part.key]());
            }
            else
                partProps = props;
            return [
                part.key,
                part.compDefinition.comp(partProps, partRefs, contexts.splice(0, part.compDefinition.clientContexts.length)),
            ];
        });

        return {
            render: () => {
                let viewState = defaultViewState;
                instances.forEach(
                    ([key, instance]) => {
                        if (key)
                            viewState[key] = materializeViewState(instance.render())
                        else
                            viewState = {...viewState, ...instance.render()}
                    }
                );
                return viewState;
            },
        } as unknown as CompCore;
    };

    const contextMarkers = parts.reduce((cm, part) => {
        return [...cm, ...part.compDefinition.clientContexts];
    }, []);

    return makeJayComponent<PropsT, ViewState, Refs, JayElementT, Array<any>, CompCore>(preRender, comp, ...contextMarkers);
}
