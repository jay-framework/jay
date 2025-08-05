import { BoardElementRefs, render } from './board.jay-html';
import {
    createDerivedArray,
    createSignal,
    makeJayComponent,
    Props,
} from '@jay-framework/component';
import { ADD, JSONPatch, patch, REMOVE } from '@jay-framework/json-patch';
import { DEFAULT_PILLARS } from './DEFAULT_PILLARS';

export interface BoardProps {
    title: string;
}

function BoardConstructor({ title }: Props<BoardProps>, refs: BoardElementRefs) {
    let [pillars, setPillars] = createSignal(DEFAULT_PILLARS);

    const boardPillars = createDerivedArray(pillars, (item, index, length) => {
        let { pillarId, title, pillarTasks } = item();
        console.log('mapping pillar:', pillarId, title);
        return {
            pillarId,
            pillarData: {
                pillarTasks,
                title,
                hasPrev: index() > 0,
                hasNext: index() < length() - 1,
            },
        };
    });

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

    refs.boardPillars.pillars.onMoveTaskToNext(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, +1, 0);
    });
    refs.boardPillars.pillars.onMoveTaskToPrev(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, -1, 0);
    });
    refs.boardPillars.pillars.onMoveTaskUp(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, 0, -1);
    });
    refs.boardPillars.pillars.onMoveTaskDown(({ viewState, event }) => {
        moveTask(viewState.pillarId, event.taskId, 0, +1);
    });

    return {
        render: () => ({ title, boardPillars }),
    };
}

export const Board = makeJayComponent(render, BoardConstructor);
