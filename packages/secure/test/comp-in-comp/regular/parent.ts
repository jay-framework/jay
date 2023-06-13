import {ParentElementRefs, render as ParentRender} from './parent.jay.html';
import {makeJayComponent, Props, createState} from 'jay-component';

export interface ParentProps {}
function ParentConstructor({}: Props<ParentProps>, refs: ParentElementRefs) {

    let [text, setText] = createState('parent text');
    let [childText, setChildText] = createState('child text');

    refs.button.onclick(
        ({event, coordinate, viewState}) =>
            refs.child.setChildText(`event from parent ${event} ${coordinate} ${JSON.stringify(viewState)}`))
    refs.child.onChildClick(({event, viewState, coordinate}) => {
        setText(`event from child: ${event} ${coordinate} ${JSON.stringify(viewState)}`)
        refs.child.setChildText(`event from child to parent to API call to child`)
    })

    return {
        render: () => ({text, childText}),
    }
}

export const Parent = makeJayComponent(ParentRender, ParentConstructor);

