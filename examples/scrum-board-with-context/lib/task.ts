import { render, TaskElementRefs } from './task.jay-html';
import { createEffect, createMemo, makeJayComponent, Props } from 'jay-component';
import { SCRUM_CONTEXT, ScrumContext } from './scrum-context';

export interface TaskProps {
    pillarId: string;
    taskId: string;
}

function TaskConstructor(
    { pillarId, taskId }: Props<TaskProps>,
    refs: TaskElementRefs,
    {pillars, moveTaskToNext, moveTaskToPrev, moveTaskDown, moveTaskUp}: ScrumContext,
) {
    const pillarIndex = createMemo(() =>
        pillars().findIndex((_) => _.pillarId === pillarId()),
    );
    const pillar = createMemo(() => pillars()[pillarIndex()]);
    const taskIndex = createMemo(() =>
        pillar().pillarTasks.findIndex((_) => _.taskId === taskId()),
    );
    const task = createMemo(() => pillar().pillarTasks[taskIndex()]);

    createEffect(() => {
        console.log(
            'task',
            'pillarId:',
            pillarId(),
            'pillarIndex:',
            pillarIndex(),
            'taskId:',
            taskId(),
            'taskIndex:',
            taskIndex(),
            'pillar:',
            pillar(),
            'task:',
            task(),
        );
    });

    refs.next.onclick(() => moveTaskToNext(pillarId(), taskId()));
    refs.up.onclick(() => moveTaskUp(pillarId(), taskId()));
    refs.down.onclick(() => moveTaskDown(pillarId(), taskId()));
    refs.prev.onclick(() => moveTaskToPrev(pillarId(), taskId()));

    return {
        render: () => ({
            title: task().title,
            description: task().description,
            isTop: taskIndex() === 0,
            isBottom: taskIndex() === pillar().pillarTasks.length - 1,
            hasNext: pillarIndex() !== pillars().length - 1,
            hasPrev: pillarIndex() > 0,
        })
    };
}

export const Task = makeJayComponent(render, TaskConstructor, SCRUM_CONTEXT);
