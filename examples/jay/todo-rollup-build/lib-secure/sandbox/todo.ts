import {
    Filter,
    render,
    ShownTodoOfTodoViewState,
    TodoElementRefs,
    TodoViewState,
} from './todo.jay-html';
import { createMemo, createSignal, makeJayComponent, Props } from '@jay-framework/component';
import { uuid } from './uuid';
import { patch } from '@jay-framework/json-patch';
import { ADD, REPLACE } from '@jay-framework/json-patch';
import { handler$ } from '@jay-framework/secure';

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
    const [filter, setFilter] = createSignal<Filter>(Filter.all);
    const [newTodo, setNewTodo] = createSignal('');

    const shownTodos = createMemo(() => [
        ...todos().filter((todo) => {
            if (filter() === Filter.completed) return todo.isCompleted;
            else if (filter() === Filter.active) return !todo.isCompleted;
            else return true;
        }),
    ]);

    refs.filterActive.onclick(() => setFilter(Filter.active));
    refs.filterCompleted.onclick(() => setFilter(Filter.completed));
    refs.filterAll.onclick(() => setFilter(Filter.all));

    refs.newTodo
        .onkeydown$(handler$<KeyboardEvent, TodoViewState, any>('3'))
        .then(({ event: keyCode }) => {
            if (keyCode !== ENTER_KEY) return;

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
        });

    refs.newTodo.oninput$(handler$<Event, TodoViewState, any>('4')).then(({ event: value }) => {
        setNewTodo(value);
    });

    refs.clearCompleted.onclick((event) => {
        setTodos(
            todos().filter(function (todo) {
                return !todo.isCompleted;
            }),
        );
    });

    refs.shownTodos.items.onCompletedToggle(({ event: newCompleted, viewState: item }) => {
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

    refs.shownTodos.items.onTitleChanged(({ event: newTitle, viewState: item }) => {
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

    refs.shownTodos.items.onRemove(({ viewState: item }) => {
        setTodos(todos().filter((_) => _ !== item));
    });

    refs.toggleAll
        .onchange$(handler$<Event, TodoViewState, any>('5'))
        .then(({ event: completed }) => {
            setTodos(todos().map((todo) => ({ ...todo, isCompleted: completed })));
        });

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
