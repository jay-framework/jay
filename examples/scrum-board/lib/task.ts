import { render, TaskElementRefs, TaskViewState } from './task.jay.html';
import { createEvent, makeJayComponent, Props } from 'jay-component';

export interface TaskProps extends TaskViewState {}

function TaskConstructor(props: Props<TaskProps>, refs: TaskElementRefs) {
    let onNext = createEvent();
    let onPrev = createEvent();
    let onUp = createEvent();
    let onDown = createEvent();

    refs.next.onclick(() => onNext.emit());
    refs.up.onclick(() => onUp.emit());
    refs.down.onclick(() => onDown.emit());
    refs.prev.onclick(() => onPrev.emit());

    return {
        render: () => props,
        onNext,
        onDown,
        onUp,
        onPrev,
    };
}

export const Task = makeJayComponent(render, TaskConstructor);
