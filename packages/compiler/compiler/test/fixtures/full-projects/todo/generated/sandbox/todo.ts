import {
    FilterOfTodoViewState,
    render,
    ShownTodoOfTodoViewState,
    TodoElementRefs,
    TodoViewState,
    // @ts-expect-error Cannot find module
} from './todo.jay-html?jay-workerSandbox';
import { createMemo, createSignal, makeJayComponent, Props } from 'jay-component';
// @ts-expect-error Cannot find module
import { uuid } from './uuid?jay-workerSandbox';
import { patch } from 'jay-json-patch';
import { ADD, REPLACE } from 'jay-json-patch';
import { JayEvent } from 'jay-runtime';
import { handler$ } from 'jay-secure';
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
    refs.newTodo.onkeydown$(handler$('0')).then(({ event }: JayEvent<any, TodoViewState>) => {
        if (event.$0 === ENTER_KEY) {
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
    refs.newTodo
        .oninput$(handler$('1'))
        .then(({ event }: JayEvent<any, TodoViewState>) => setNewTodo(event.$0));
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
