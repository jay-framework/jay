import { CompElementRefs, render as CompRender } from './comp.jay.html';
import { makeJayComponent, Props, createState } from 'jay-component';

export interface CompProps {}
function CompConstructor({}: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('default result');
    let [items] = createState([
        { id: 'a', text: 'alpha' },
        { id: 'b', text: 'beta' },
        { id: 'c', text: 'gamma' },
    ]);

    refs.button.onclick(() => setText('static button was clicked'));
    refs.input
        .oninput$(({ event }) => (event.target as HTMLInputElement).value)
        .then(({ event }) => setText(event));

    refs.itemButton.onclick(({ viewState: item, coordinate }) =>
        setText(`dynamic button ${item.text} was clicked at coordinate [${coordinate}]`),
    );
    refs.itemInput
        .oninput$(({ event }) => (event.target as HTMLInputElement).value)
        .then(({ viewState: item, event, coordinate }) =>
            setText(
                `dynamic input ${item.text} updated with value '${event}' at coordinate [${coordinate}]`,
            ),
        );

    return {
        render: () => ({ text, items }),
    };
}

export const Comp = makeJayComponent(CompRender, CompConstructor);
