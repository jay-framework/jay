import { BoardElementRefs, render } from './board.jay-html';
import { createDerivedArray, createEffect, makeJayComponent, Props } from 'jay-component';
import { provideScrumContext } from './scrum-context';

export interface BoardProps {
    title: string;
}

function BoardConstructor({ title }: Props<BoardProps>, refs: BoardElementRefs) {
    let { pillars, moveTaskUp, moveTaskToPrev, moveTaskToNext, moveTaskDown } =
        provideScrumContext();

    const boardPillars = createDerivedArray(pillars, (item, index, length) => {
        let { pillarId, title, pillarTasks } = item();
        return {
            pillarId,
        };
    });

    createEffect(() => {
        console.log('board', 'pillars:', pillars());
    });

    return {
        render: () => ({ title, boardPillars }),
    };
}

export const Board = makeJayComponent(render, BoardConstructor);
