import { render, PillarElementRefs } from './pillar.jay-html';
import {createEvent, makeJayComponent, Props, createDerivedArray, createMemo} from 'jay-component';
import {SCRUM_CONTEXT, ScrumContext} from "./scrum-context";

export interface PillarProps {
    pillarId: string;
}

interface MoveTaskEvent {
    taskId: string;
}

function PillarConstructor(
    { pillarId }: Props<PillarProps>,
    refs: PillarElementRefs,
    context: ScrumContext
) {
    const onMoveTaskToNext = createEvent<MoveTaskEvent>();
    const onMoveTaskToPrev = createEvent<MoveTaskEvent>();
    const onMoveTaskUp = createEvent<MoveTaskEvent>();
    const onMoveTaskDown = createEvent<MoveTaskEvent>();

    const pillar = createMemo(() => context.pillars().find(_ => _.pillarId === pillarId()))
    const title = createMemo(() => pillar().title)

    const taskData = createDerivedArray(() => pillar().pillarTasks, (item, index, length) => {
        let { taskId } = item();
        return {
            taskId,
            pillarId: pillarId()
        };
    });

    refs.tasks.onNext(({ viewState }) => onMoveTaskToNext.emit({ taskId: viewState.taskId }));
    refs.tasks.onPrev(({ viewState }) => onMoveTaskToPrev.emit({ taskId: viewState.taskId }));
    refs.tasks.onUp(({ viewState }) => onMoveTaskUp.emit({ taskId: viewState.taskId }));
    refs.tasks.onDown(({ viewState }) => onMoveTaskDown.emit({ taskId: viewState.taskId }));

    return {
        render: () => ({ title, taskData }),
        onMoveTaskToNext,
        onMoveTaskToPrev,
        onMoveTaskDown,
        onMoveTaskUp,
    };
}

export const Pillar = makeJayComponent(render, PillarConstructor, SCRUM_CONTEXT);
