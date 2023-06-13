import {ChildElementRefs, render as ChildRender} from './child.jay.html';
import {makeJayComponent, Props, createMemo, createEvent, createState} from 'jay-component';

export interface ChildProps {
    textFromParent: string
}
function ChildConstructor({textFromParent}: Props<ChildProps>, refs: ChildElementRefs) {
    let text = createMemo(() => `text from parent: ${textFromParent()}`);
    let [text2, setText2] = createState('text from parent API');
    let onChildClick = createEvent<string>()

    refs.button.onclick(
        ({event, viewState, coordinate}) =>
            onChildClick.emit(`event from child: ${event} ${coordinate} ${JSON.stringify(viewState)}`))

    const setChildText = (text) => setText2(`text from parent API: ${text}`)

    return {
        render: () => ({text, text2}),
        onChildClick,
        setChildText
    }
}

export const Child = makeJayComponent(ChildRender, ChildConstructor);

