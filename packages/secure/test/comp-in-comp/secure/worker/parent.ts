import {ParentElementRefs, render as ParentRender} from './parent.jay.html';
import {makeJayComponent, Props, createState} from 'jay-component';

export interface ParentProps {}
function ParentConstructor({}: Props<ParentProps>, refs: ParentElementRefs) {

    let [textFromChildEvent, setTextFromChildEvent] = createState('-');
    let [viewStateFromChildEvent, setViewStataFromChildEvent] = createState('-');
    let [coordinateFromChildEvent, setCoordinateFromChildEvent] = createState('-');
    let [childText, setChildText] = createState('-');

    refs.parentChangesChildPropButton.onclick(
        ({event, coordinate, viewState}) =>
            refs.child.setChildText(`event from parent ${event} ${coordinate} ${JSON.stringify(viewState)}`))
    refs.parentCallsChildApiButton.onclick(
        ({event, coordinate, viewState}) =>
            refs.child.setChildText(`event from parent ${event} ${coordinate} ${JSON.stringify(viewState)}`))
    refs.child.onChildClick(({event, viewState, coordinate}) => {
        setTextFromChildEvent(event.useCase)
        setViewStataFromChildEvent(JSON.stringify(viewState))
        setCoordinateFromChildEvent(JSON.stringify(coordinate))
        if (event.useCaseId === 1 /* update prop */)
            setChildText('update from parent');
        else if (event.useCaseId === 2 /* call child api */)
            refs.child.setChildText(`parent calling child api`)
    })

    return {
        render: () => ({
            textFromChildEvent,
            viewStateFromChildEvent,
            coordinateFromChildEvent,
            childText
        }),
    }
}

export const Parent = makeJayComponent(ParentRender, ParentConstructor);

