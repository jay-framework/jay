import {render, PillarElementRefs} from './pillar.jay.html';
import {createEvent, makeJayComponent, Props} from 'jay-component';
import {TaskProps} from "./task";

export interface PillarTask extends TaskProps {
    id: string
}

export interface PillarProps {
    title: string
    tasks: Array<PillarTask>
}

interface MoveTaskEvent {
    taskId: string
}

function PillarConstructor({ title, tasks }: Props<PillarProps>, refs: PillarElementRefs) {

    let onMoveTaskToNext = createEvent<MoveTaskEvent>();
    let onMoveTaskToPrev = createEvent<MoveTaskEvent>();

    refs.tasks.onNext(({viewState}) => {
        onMoveTaskToNext.emit({taskId: viewState.id})
    })
    refs.tasks.onPrev(({viewState}) =>
        onMoveTaskToPrev.emit({taskId: viewState.id}))

    return {
        render: () => ({ title, tasks }),
        onMoveTaskToNext, onMoveTaskToPrev
    };
}

export const Pillar = makeJayComponent(render, PillarConstructor);
