import { createSignal, provideReactiveContext } from 'jay-component';
import { Getter, Setter } from 'jay-reactive';
import { createJayContext } from 'jay-runtime';
import { DEFAULT_PILLARS } from './DEFAULT_PILLARS';
import { ADD, JSONPatch, patch, REMOVE } from 'jay-json-patch';

export interface BoardPillarTask {
    taskId: string;
    title: string;
    description: string;
}

export interface BoardPillar {
    pillarId: string;
    title: string;
    pillarTasks: Array<BoardPillarTask>;
}

export type MoveTask = (pillarId: string, taskId: string) => void;
export interface ScrumContext {
    pillars: Getter<BoardPillar[]>;
    moveTaskToNext: MoveTask;
    moveTaskToPrev: MoveTask;
    moveTaskUp: MoveTask;
    moveTaskDown: MoveTask;
}
export const SCRUM_CONTEXT = createJayContext<ScrumContext>();

function moveTask(
    pillars: BoardPillar[],
    pillarId: string,
    taskId: string,
    pillarOffset: number,
    taskOffset: number,
): BoardPillar[] {
    let pillarIndex = pillars.findIndex((pillar) => pillar.pillarId === pillarId);
    let taskIndex = pillars[pillarIndex].pillarTasks.findIndex((aTask) => aTask.taskId === taskId);
    let newTaskIndex = Math.min(
        taskIndex + taskOffset,
        pillars[pillarIndex + pillarOffset].pillarTasks.length,
    );
    if (pillarIndex + pillarOffset < 0 || pillarIndex + pillarOffset >= pillars.length) return;
    if (newTaskIndex < 0) return;
    let jsonPatch: JSONPatch = [
        { op: REMOVE, path: [pillarIndex, 'pillarTasks', taskIndex] },
        {
            op: ADD,
            path: [pillarIndex + pillarOffset, 'pillarTasks', newTaskIndex],
            value: pillars[pillarIndex].pillarTasks[taskIndex],
        },
    ];
    return patch(pillars, jsonPatch);
}

export const provideScrumContext = () =>
    provideReactiveContext(SCRUM_CONTEXT, () => {
        let [pillars, setPillars] = createSignal(DEFAULT_PILLARS);

        const moveTaskToNext = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, +1, 0));
        };
        const moveTaskToPrev = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, -1, 0));
        };
        const moveTaskUp = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, 0, +1));
        };
        const moveTaskDown = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, 0, -1));
        };

        return {
            pillars,
            moveTaskToNext,
            moveTaskToPrev,
            moveTaskDown,
            moveTaskUp,
        };
    });
