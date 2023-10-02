import { render, PillarElementRefs } from './pillar.jay.html';
import { createEvent, makeJayComponent, Props } from 'jay-component';
import { TaskProps } from './task';

export interface PillarTask extends TaskProps {
    id: string;
}

export interface PillarProps {
    title: string;
    tasks: Array<PillarTask>;
}

interface MoveTaskEvent {
    task: PillarTask;
}

function PillarConstructor({ title, tasks }: Props<PillarProps>, refs: PillarElementRefs) {
    let onMoveTaskToNext = createEvent<MoveTaskEvent>();
    let onMoveTaskToPrev = createEvent<MoveTaskEvent>();
    let onMoveTaskUp = createEvent<MoveTaskEvent>();
    let onMoveTaskDown = createEvent<MoveTaskEvent>();

    refs.tasks.onNext(({ viewState }) => onMoveTaskToNext.emit({ task: viewState }));
    refs.tasks.onPrev(({ viewState }) => onMoveTaskToPrev.emit({ task: viewState }));
    refs.tasks.onUp(({ viewState }) => onMoveTaskUp.emit({ task: viewState }));
    refs.tasks.onDown(({ viewState }) => onMoveTaskDown.emit({ task: viewState }));

    return {
        render: () => ({ title, tasks }),
        onMoveTaskToNext,
        onMoveTaskToPrev,
        onMoveTaskDown,
        onMoveTaskUp,
    };
}

export const Pillar = makeJayComponent(render, PillarConstructor);
