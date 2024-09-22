import { Getter } from 'jay-reactive';
import { createJayContext } from 'jay-runtime';
import { createMemo, createState, provideReactiveContext } from 'jay-component';
import { ShownTodo } from './todo.jay-html';
import { ADD, patch, REPLACE } from 'jay-json-patch';
import { uuid } from './uuid';

export interface TodoItem {
    id: string;
    title: string;
    isCompleted: boolean;
}

export interface TodoContext {
    todos: Getter<TodoItem[]>;
    activeTodoCount: Getter<number>;
    clearCompleted: () => void;
    addTodo: (value: string) => void;
    toggleAll: (isCompleted: boolean) => void;
    remove: (id: string) => void;
    changeTitle: (id: string, newTitle: string) => void;
    completeToggle: (id: string, newValue: boolean) => void;
}

const initialTodos: TodoItem[] = [
    {
        id: 'a1',
        title: 'a title 1',
        isCompleted: false,
    },
    {
        id: 'a2',
        title: 'a title 2',
        isCompleted: false,
    },
    {
        id: 'a3',
        title: 'a title 3',
        isCompleted: true,
    },
];

export const TODO_CONTEXT = createJayContext<TodoContext>();

export const provideTodoContext = () =>
    provideReactiveContext(TODO_CONTEXT, () => {
        const [todos, setTodos] = createState(initialTodos);

        const activeTodoCount = createMemo(() =>
            todos().reduce(function (accum: number, todo: TodoItem) {
                return todo.isCompleted ? accum : accum + 1;
            }, 0),
        );

        const addTodo = (value: string) => {
            setTodos(
                patch(todos(), [
                    {
                        op: ADD,
                        path: [todos().length],
                        value: {
                            id: uuid(),
                            title: value,
                            isEditing: false,
                            editText: '',
                            isCompleted: false,
                        },
                    },
                ]),
            );
        };

        const clearCompleted = () => {
            setTodos(
                todos().filter(function (todo) {
                    return !todo.isCompleted;
                }),
            );
        };

        const toggleAll = (isCompleted: boolean) => {
            setTodos(
                todos().map((todo) => ({
                    ...todo,
                    isCompleted,
                })),
            );
        };

        const remove = (id: string) => {
            setTodos(todos().filter((_) => _.id !== id));
        };

        const changeTitle = (id: string, newTitle: string) => {
            let itemIndex = todos().findIndex((_) => _.id === id);
            setTodos(
                patch(todos(), [
                    {
                        op: REPLACE,
                        path: [itemIndex, 'title'],
                        value: newTitle,
                    },
                ]),
            );
        };

        const completeToggle = (id: string, newValue: boolean) => {
            let itemIndex = todos().findIndex((_) => _.id === id);
            setTodos(
                patch(todos(), [
                    {
                        op: REPLACE,
                        path: [itemIndex, 'isCompleted'],
                        value: newValue,
                    },
                ]),
            );
        };

        return {
            todos,
            activeTodoCount,
            clearCompleted,
            addTodo,
            toggleAll,
            remove,
            changeTitle,
            completeToggle,
        };
    });
