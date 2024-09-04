import { render, TaskElementRefs, TaskViewState } from './task.jay-html';
import {createEffect, createEvent, createMemo, makeJayComponent, Props} from 'jay-component';
import {SCRUM_CONTEXT, ScrumContext} from "./scrum-context";

export interface TaskProps {
    pillarId: string,
    taskId: string
}

function TaskConstructor({pillarId, taskId}: Props<TaskProps>, refs: TaskElementRefs, context: ScrumContext) {
    const onNext = createEvent();
    const onPrev = createEvent();
    const onUp = createEvent();
    const onDown = createEvent();

    const pillarIndex = createMemo(() => context.pillars().findIndex(_ => _.pillarId === pillarId()));
    const pillar = createMemo(() => context.pillars()[pillarIndex()]);
    const taskIndex = createMemo(() => pillar().pillarTasks.findIndex(_ => _.taskId === taskId()));
    const task = createMemo(() => pillar().pillarTasks[taskIndex()])

    createEffect(() => {
        console.log('task', "pillarId:", pillarId(), "pillarIndex:", pillarIndex(), "taskId:", taskId(),
            "taskIndex:", taskIndex(), "pillar:", pillar(), "task:", task());
    })

    refs.next.onclick(() => onNext.emit());
    refs.up.onclick(() => onUp.emit());
    refs.down.onclick(() => onDown.emit());
    refs.prev.onclick(() => onPrev.emit());

    return {
        render: () => ({title: task().title,
            description: task().description,
            isTop: taskIndex() === 0,
            isBottom: taskIndex() === pillar().pillarTasks.length - 1,
            hasNext: pillarIndex() !== context.pillars().length - 1,
            hasPrev: pillarIndex() > 0
        }),
        onNext,
        onDown,
        onUp,
        onPrev,
    };
}

export const Task = makeJayComponent(render, TaskConstructor, SCRUM_CONTEXT);
