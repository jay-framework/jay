import { CompElementRefs, CompViewState, Item, render as CompRender } from './comp.jay-html';
import { makeJayComponent, Props, createSignal } from '@jay-framework/component';
import { handler$ } from '../../../../lib/';

export interface CompProps {}
function CompConstructor({}: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createSignal('default result');
    let [items] = createSignal([
        { id: 'a', text: 'alpha' },
        { id: 'b', text: 'beta' },
        { id: 'c', text: 'gamma' },
    ]);

    refs.button.onclick(() => setText('static button was clicked'));
    refs.input
        .oninput$(handler$<Event, CompViewState, any>('1'))
        .then(({ event }) => setText(event));

    refs.itemButton.onclick(({ viewState: item, coordinate }) =>
        setText(`dynamic button ${item.text} was clicked at coordinate [${coordinate}]`),
    );
    refs.itemInput
        .oninput$(handler$<Event, Item, any>('2'))
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
