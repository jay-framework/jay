import {
    FilterOfTodoViewState,
    render,
    ShownTodoOfTodoViewState,
    TodoElementRefs,
    TodoViewState,
} from './todo.jay-html';
import { createMemo, createSignal, makeJayComponent, Props } from '@jay-framework/component';
import { uuid } from './uuid';
import { patch } from '@jay-framework/json-patch';
import { ADD, REPLACE } from '@jay-framework/json-patch';
import './todo.css';
import { JayEvent } from '@jay-framework/runtime';

const ENTER_KEY = 13;

export interface TodoItem {
    id: string;
    title: string;
    isCompleted: boolean;
}

export interface TodoProps {
    initialTodos: Array<TodoItem>;
}

function TodoComponentConstructor({ initialTodos }: Props<TodoProps>, refs: TodoElementRefs) {
    const [todos, setTodos] = createSignal(
        initialTodos().map((_) => ({ ..._, isEditing: false, editText: '' })),
    );

    const activeTodoCount = createMemo(() =>
        todos().reduce(function (accum: number, todo: ShownTodoOfTodoViewState) {
            return todo.isCompleted ? accum : accum + 1;
        }, 0),
    );

    const noActiveItems = createMemo(() => activeTodoCount() === 0);
    const activeTodoWord = createMemo(() => (activeTodoCount() > 1 ? 'todos' : 'todo'));
    const hasItems = createMemo(() => todos().length > 0);
    const showClearCompleted = createMemo(() => !!todos().find((_) => _.isCompleted));
    const [filter, setFilter] = createSignal<FilterOfTodoViewState>(FilterOfTodoViewState.all);
    const [newTodo, setNewTodo] = createSignal('');

    const shownTodos = createMemo(() => [
        ...todos().filter((todo) => {
            if (filter() === FilterOfTodoViewState.completed) return todo.isCompleted;
            else if (filter() === FilterOfTodoViewState.active) return !todo.isCompleted;
            else return true;
        }),
    ]);

    refs.filterActive.onclick(() => setFilter(FilterOfTodoViewState.active));
    refs.filterCompleted.onclick(() => setFilter(FilterOfTodoViewState.completed));
    refs.filterAll.onclick(() => setFilter(FilterOfTodoViewState.all));

    refs.newTodo.onkeydown(({ event }: JayEvent<KeyboardEvent, TodoViewState>) => {
        if (event.keyCode === ENTER_KEY) {
            event.preventDefault();
            let newValue = newTodo();
            let val = newValue.trim();

            if (val) {
                setTodos(
                    patch(todos(), [
                        {
                            op: ADD,
                            path: [todos().length],
                            value: {
                                id: uuid(),
                                title: val,
                                isEditing: false,
                                editText: '',
                                isCompleted: false,
                            },
                        },
                    ]),
                );
            }
            setNewTodo('');
        }
    });

    refs.newTodo.oninput(({ event }: JayEvent<Event, TodoViewState>) =>
        setNewTodo((event.target as HTMLInputElement).value),
    );

    refs.clearCompleted.onclick((event) => {
        setTodos(
            todos().filter(function (todo) {
                return !todo.isCompleted;
            }),
        );
    });

    refs.items.onCompletedToggle(({ event: newCompleted, viewState: item }) => {
        let itemIndex = todos().findIndex((_) => _.id === item.id);
        setTodos(
            patch(todos(), [
                {
                    op: REPLACE,
                    path: [itemIndex, 'isCompleted'],
                    value: newCompleted,
                },
            ]),
        );
    });

    refs.items.onTitleChanged(({ event: newTitle, viewState: item }) => {
        let itemIndex = todos().findIndex((_) => _.id === item.id);
        setTodos(
            patch(todos(), [
                {
                    op: REPLACE,
                    path: [itemIndex, 'title'],
                    value: newTitle,
                },
            ]),
        );
    });

    refs.items.onRemove(({ viewState: item }) => {
        setTodos(todos().filter((_) => _ !== item));
    });

    refs.toggleAll.onchange(({ event }: JayEvent<Event, TodoViewState>) =>
        setTodos(
            todos().map((todo) => ({
                ...todo,
                isCompleted: (event.target as HTMLInputElement).checked,
            })),
        ),
    );

    return {
        render: () => ({
            activeTodoCount,
            noActiveItems,
            activeTodoWord,
            hasItems,
            showClearCompleted,
            shownTodos,
            filter,
            newTodo,
        }),
    };
}

export const TodoComponent = makeJayComponent(render, TodoComponentConstructor);
