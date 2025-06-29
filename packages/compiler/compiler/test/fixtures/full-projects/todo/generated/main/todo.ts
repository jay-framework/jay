import {
    render,
    // @ts-expect-error Cannot find module
} from './todo.jay-html?jay-mainSandbox';
import { makeJayComponentBridge, FunctionsRepository } from '@jay-framework/secure';
import './todo.css';
import { JayEvent } from '@jay-framework/runtime';
export interface TodoItem {
    id: string;
    title: string;
    isCompleted: boolean;
}
export interface TodoProps {
    initialTodos: Array<TodoItem>;
}
const ENTER_KEY = 13;
const funcRepository: FunctionsRepository = {
    '0': ({ event }: JayEvent<any, any>) => {
        if (event.keyCode === ENTER_KEY) {
            event.preventDefault();
        }
        return { $0: event.keyCode };
    },
    '1': ({ event }: JayEvent<any, any>) => ({ $0: event.target.value }),
};
export const TodoComponent = makeJayComponentBridge(render, { funcRepository });
