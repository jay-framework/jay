import {JayComponentCore, makeJayComponent, Props,} from 'jay-component';
import {PreRenderElement} from 'jay-runtime';
import {CompositePart} from "./composite-part";

export function makeCompositeJayComponent<
    PropsT extends object,
    ViewState extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    preRender: PreRenderElement<any, any, any>,
    defaultViewState: ViewState,
    parts: Array<CompositePart>,
) {
    const comp = (props: Props<any>, refs, ...contexts): CompCore => {
        const instances: Array<[string, JayComponentCore<any, any>]> = parts.map((part) => {
            return [
                part.viewStateKey,
                part.compDefinition.comp(props, refs, contexts.splice(0, part.compDefinition.clientContexts.length)),
            ];
        });

        return {
            render: () => {
                let viewState = defaultViewState;
                instances.forEach(
                    ([key, instance]) => (viewState = { ...viewState, ...instance.render() }),
                );
                return viewState;
            },
        } as unknown as CompCore;
    };

    const contextMarkers = parts.reduce((cm, part) => {
        return [...cm, ...part.compDefinition.clientContexts];
    }, []);

    return makeJayComponent(preRender, comp, ...contextMarkers);
}
