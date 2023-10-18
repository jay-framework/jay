import { BoardElementRefs, BoardPillar, render } from './board.jay.html';
import { createMemo, createState, makeJayComponent, Props } from 'jay-component';
import { ADD, JSONPatch, patch, REMOVE } from 'jay-json-patch';
import { DEFAULT_PILLARS } from './DEFAULT_PILLARS';

export interface BoardProps {
    title: string;
}

function BoardConstructor({ title }: Props<BoardProps>, refs: BoardElementRefs) {
    let [pillars, setPillars] = createState(DEFAULT_PILLARS);

    const boardPillars = createMemo<BoardPillar[]>(() =>
        pillars().map((pillar, index) => {
            let { pillarId, title, pillarTasks } = pillar;
            return {
                pillarId,
                pillarData: {
                    pillarTasks,
                    title,
                    hasPrev: index > 0,
                    hasNext: index < pillars().length - 1,
                },
            };
        }),
    );

    function moveTask(pillarId: string, taskId: string, pillarOffset: number, taskOffset: number) {
        let pillarIndex = pillars().findIndex((pillar) => pillar.pillarId === pillarId);
        let taskIndex = pillars()[pillarIndex].pillarTasks.findIndex(
            (aTask) => aTask.id === taskId,
        );
        let newTaskIndex = Math.min(
            taskIndex + taskOffset,
            pillars()[pillarIndex + pillarOffset].pillarTasks.length,
        );
        if (pillarIndex + pillarOffset < 0 || pillarIndex + pillarOffset >= pillars().length)
            return;
        if (newTaskIndex < 0) return;
        let jsonPatch: JSONPatch = [
            { op: REMOVE, path: [pillarIndex, 'pillarTasks', taskIndex] },
            {
                op: ADD,
                path: [pillarIndex + pillarOffset, 'pillarTasks', newTaskIndex],
                value: pillars()[pillarIndex].pillarTasks[taskIndex],
            },
        ];
        setPillars(patch(pillars(), jsonPatch));
    }

    refs.pillars.onMoveTaskToNext(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, +1, 0);
    });
    refs.pillars.onMoveTaskToPrev(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, -1, 0);
    });
    refs.pillars.onMoveTaskUp(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, 0, -1);
    });
    refs.pillars.onMoveTaskDown(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, 0, +1);
    });

    return {
        render: () => ({ title, boardPillars }),
    };
}

export const Board = makeJayComponent(render, BoardConstructor);
