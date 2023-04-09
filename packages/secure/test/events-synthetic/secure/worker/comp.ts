import {CompRefs, CompViewState, Item, render as CompRender} from './comp.jay.html';
import {makeJayComponent, Props, createMemo, createState, createMutableState} from 'jay-component';
import {$func} from "../../../../lib/$func";

export interface CompProps {
}
function CompConstructor({}: Props<CompProps>, refs: CompRefs) {

    let [text, setText] = createState('default result')
    let items = createMutableState([
        {id: 'a', text: "alpha"},
        {id: 'b', text: "beta"},
        {id: 'c', text: "gamma"}
    ])

    refs.button.onclick(() => setText('static button was clicked'))
    refs.input.$oninput($func<Event, CompViewState, any>('1'))
        .then(({event}) => setText(event))

    refs.itemButton.onclick(({viewState: item}) => setText(`dynamic button ${item.text} was clicked`))
    refs.itemInput.$oninput($func<Event, Item, any>('2'))
        .then(({viewState: item, event}) => setText(`dynamic input ${item.text} updated with value '${event}'`))

    return {
        render: () => ({text, items}),

    }
}

export const Comp = makeJayComponent(CompRender, CompConstructor);

