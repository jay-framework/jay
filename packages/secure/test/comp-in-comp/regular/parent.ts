import {DynamicChild, ParentElementRefs, render as ParentRender} from './parent.jay.html';
import {makeJayComponent, Props, createState, createMutableState} from 'jay-component';

export interface ParentProps {}
function ParentConstructor({}: Props<ParentProps>, refs: ParentElementRefs) {

    let [textFromChildEvent, setTextFromChildEvent] = createState('-');
    let [viewStateFromChildEvent, setViewStataFromChildEvent] = createState('-');
    let [coordinateFromChildEvent, setCoordinateFromChildEvent] = createState('-');
    let [childText, setChildText] = createState('-');
    let dynamicChildren = createMutableState([
        {id: 'A', childText: '-'}
    ])

    refs.parentChangesChildPropButton.onclick(
        ({event, coordinate, viewState}) => {
            setChildText(`event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(viewState)}`)
            dynamicChildren()[0].childText = `event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(viewState)}`
        })
    refs.parentCallsChildApiButton.onclick(
        ({event, coordinate, viewState}) => {
            refs.staticChild.setChildText(`event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(viewState)}`)
            dynamicChildren()[0].childText = `event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(viewState)}`
        })
    refs.staticChild.onChildClick(({event, viewState, coordinate}) => {
        setTextFromChildEvent(event.useCase)
        setViewStataFromChildEvent(JSON.stringify(viewState))
        setCoordinateFromChildEvent(JSON.stringify(coordinate))
        if (event.useCaseId === 1 /* update prop */)
            setChildText('update from parent');
        else if (event.useCaseId === 2 /* call child api */)
            refs.staticChild.setChildText(`parent calling child api`)
    })
    refs.dynamicChildren.onChildClick(({event, viewState, coordinate}) => {
        setTextFromChildEvent(event.useCase)
        setViewStataFromChildEvent(JSON.stringify(viewState))
        setCoordinateFromChildEvent(JSON.stringify(coordinate))
        if (event.useCaseId === 1 /* update prop */)
            dynamicChildren()[0].childText = 'update from parent';
        else if (event.useCaseId === 2 /* call child api */)
            refs.dynamicChildren
                .find(dynamicChild => dynamicChild.id === 'A')
                .setChildText(`parent calling child api`)
    })

    return {
        render: () => ({
            textFromChildEvent,
            viewStateFromChildEvent,
            coordinateFromChildEvent,
            childText,
            dynamicChildren
        }),
    }
}

export const Parent = makeJayComponent(ParentRender, ParentConstructor);

