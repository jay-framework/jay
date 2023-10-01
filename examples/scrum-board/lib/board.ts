import {BoardElementRefs, render} from './board.jay.html';
import {createState, makeJayComponent, Props} from 'jay-component';
import {ADD, JSONPatch, patch, REMOVE} from 'jay-json-patch';
import {DEFAULT_PILLARS} from "./DEFAULT_PILLARS";

export interface BoardProps {
    title: string
}

function BoardConstructor({ title }: Props<BoardProps>, refs: BoardElementRefs) {

    let [pillars, setPillars] = createState(DEFAULT_PILLARS)

    function moveTask(pillarId: string, taskId: string, offset: number) {
        let pillarIndex = pillars().findIndex(pillar => pillar.pillarId === pillarId);
        let taskIndex = pillars()[pillarIndex].pillarData.tasks.findIndex(task => task.id === taskId)
        let task = pillars()[pillarIndex].pillarData.tasks[taskIndex];
        let jsonPatch: JSONPatch = [
            {op: REMOVE, path: [pillarIndex, "pillarData", "tasks", taskIndex]},
            {op: ADD, path: [pillarIndex+1, "pillarData", "tasks", pillars()[pillarIndex+1].pillarData.tasks.length], value: task}
        ];
        setPillars(patch(pillars(), jsonPatch))
    }

    refs.pillars.onMoveTaskToNext(({viewState, event}) => {
        moveTask(viewState.pillarId, event.taskId, +1)
    })
    refs.pillars.onMoveTaskToPrev(({viewState, event}) => {
        moveTask(viewState.pillarId, event.taskId, -1)
    })

    return {
        render: () => ({ title, pillars }),
    };
}

export const Board = makeJayComponent(render, BoardConstructor);
