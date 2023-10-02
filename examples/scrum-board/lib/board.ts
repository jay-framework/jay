import { BoardElementRefs, render } from './board.jay.html';
import { createState, makeJayComponent, Props } from 'jay-component';
import { ADD, JSONPatch, patch, REMOVE } from 'jay-json-patch';
import { DEFAULT_PILLARS } from './DEFAULT_PILLARS';
import { PillarTask } from './pillar';

export interface BoardProps {
    title: string;
}

function BoardConstructor({ title }: Props<BoardProps>, refs: BoardElementRefs) {
    let [pillars, setPillars] = createState(DEFAULT_PILLARS);

    function moveTask(
        pillarId: string,
        task: PillarTask,
        pillarOffset: number,
        taskOffset: number,
    ) {
        let pillarIndex = pillars().findIndex((pillar) => pillar.pillarId === pillarId);
        let taskIndex = pillars()[pillarIndex].pillarData.tasks.findIndex(
            (aTask) => aTask.id === task.id,
        );
        let newTaskIndex = Math.min(
            taskIndex + taskOffset,
            pillars()[pillarIndex + pillarOffset].pillarData.tasks.length,
        );
        if (pillarIndex + pillarOffset < 0 || pillarIndex + pillarOffset >= pillars().length)
            return;
        if (newTaskIndex < 0) return;
        let jsonPatch: JSONPatch = [
            { op: REMOVE, path: [pillarIndex, 'pillarData', 'tasks', taskIndex] },
            {
                op: ADD,
                path: [pillarIndex + pillarOffset, 'pillarData', 'tasks', newTaskIndex],
                value: task,
            },
        ];
        setPillars(patch(pillars(), jsonPatch));
    }

    refs.pillars.onMoveTaskToNext(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.task, +1, 0);
    });
    refs.pillars.onMoveTaskToPrev(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.task, -1, 0);
    });
    refs.pillars.onMoveTaskUp(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.task, 0, -1);
    });
    refs.pillars.onMoveTaskDown(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.task, 0, +1);
    });

    return {
        render: () => ({ title, pillars }),
    };
}

export const Board = makeJayComponent(render, BoardConstructor);
