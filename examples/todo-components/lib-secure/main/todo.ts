import { render } from './todo.jay-html';
import { FunctionsRepository, makeJayComponentBridge } from 'jay-secure';
import './todo.css';
import { JayEvent } from 'jay-runtime';

export interface TodoItem {
    id: string;
    title: string;
    isCompleted: boolean;
}

export interface TodoProps {
    initialTodos: Array<TodoItem>;
}

const ENTER_KEY = 13;

export const funcRepository: FunctionsRepository = {
    '3': ({ event }: JayEvent<KeyboardEvent, any>) => {
        event.keyCode === ENTER_KEY ? event.preventDefault() : '';
        return event.keyCode;
    },
    '4': ({ event }: JayEvent<Event, any>) => (event.target as HTMLInputElement).value,
    '5': ({ event }: JayEvent<Event, any>) => (event.target as HTMLInputElement).checked,
};

export const Todo = makeJayComponentBridge(render, { funcRepository });
