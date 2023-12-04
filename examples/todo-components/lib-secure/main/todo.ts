import { render } from './todo.jay-html';
import { makeJayComponentBridge } from 'jay-secure';
import { funcRepository } from './native-funcs';
import './todo.css';

export interface TodoItem {
    id: string;
    title: string;
    isCompleted: boolean;
}

export interface TodoProps {
    initialTodos: Array<TodoItem>;
}

export const Todo = makeJayComponentBridge(render, { funcRepository });
