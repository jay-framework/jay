import { render, PillarElementRefs, TaskDatum } from './pillar.jay.html';
import {
    createEvent,
    makeJayComponent,
    Props,
    createMemo,
    createDerivedArray,
} from 'jay-component';

export interface PillarTask {
    id: string;
    title: string;
    description: string;
}

export interface PillarProps {
    title: string;
    pillarTasks: Array<PillarTask>;
    hasNext: boolean;
    hasPrev: boolean;
}

interface MoveTaskEvent {
    taskId: string;
}

function PillarConstructor(
    { title, pillarTasks, hasPrev, hasNext }: Props<PillarProps>,
    refs: PillarElementRefs,
) {
    let onMoveTaskToNext = createEvent<MoveTaskEvent>();
    let onMoveTaskToPrev = createEvent<MoveTaskEvent>();
    let onMoveTaskUp = createEvent<MoveTaskEvent>();
    let onMoveTaskDown = createEvent<MoveTaskEvent>();

    const taskData = createDerivedArray(pillarTasks, (item, index, length) => {
        let { id, title, description } = item();
        return {
            id,
            taskProps: {
                title,
                description,
                hasNext: hasNext(),
                hasPrev: hasPrev(),
                isBottom: index() === length() - 1,
                isTop: index() === 0,
            },
        };
    });

    refs.tasks.onNext(({ viewState }) => onMoveTaskToNext.emit({ taskId: viewState.id }));
    refs.tasks.onPrev(({ viewState }) => onMoveTaskToPrev.emit({ taskId: viewState.id }));
    refs.tasks.onUp(({ viewState }) => onMoveTaskUp.emit({ taskId: viewState.id }));
    refs.tasks.onDown(({ viewState }) => onMoveTaskDown.emit({ taskId: viewState.id }));

    return {
        render: () => ({ title, taskData }),
        onMoveTaskToNext,
        onMoveTaskToPrev,
        onMoveTaskDown,
        onMoveTaskUp,
    };
}

export const Pillar = makeJayComponent(render, PillarConstructor);
