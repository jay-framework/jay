import { ChildElementRefs, render as ChildRender } from './child.jay-html';
import { makeJayComponent, Props, createMemo, createEvent, createSignal } from 'jay-component';

export interface ChildProps {
    textFromParent: string;
    id: string;
}
export interface ChildEvent {
    useCase: string;
    useCaseId: number;
}
function ChildConstructor({ textFromParent, id }: Props<ChildProps>, refs: ChildElementRefs) {
    let textFromProp = createMemo(() => `text from parent: ${textFromParent()}`);
    let [textFromAPI, setTextFromAPI] = createSignal('-');
    let onChildClick = createEvent<ChildEvent>();

    refs.eventToParent.onclick(({ event, viewState, coordinate }) =>
        onChildClick.emit({ useCase: `event from child`, useCaseId: 0 }),
    );
    refs.eventToParentToChildProp.onclick(({ event, viewState, coordinate }) =>
        onChildClick.emit({ useCase: `event from child, parent changes child prop`, useCaseId: 1 }),
    );
    refs.eventToParentToChildApi.onclick(({ event, viewState, coordinate }) =>
        onChildClick.emit({ useCase: `event from child, parent calls child api`, useCaseId: 2 }),
    );

    const setChildText = (text) => setTextFromAPI(text);

    return {
        render: () => ({ textFromProp, textFromAPI, id }),
        onChildClick,
        setChildText,
    };
}

export const Child = makeJayComponent(ChildRender, ChildConstructor);
