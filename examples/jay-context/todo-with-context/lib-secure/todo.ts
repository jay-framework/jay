import {
    FilterOfTodoViewState,
    render,
    ShownTodoOfTodoViewState,
    TodoElementRefs,
    TodoViewState,
} from './todo.jay-html';
import { createMemo, createSignal, makeJayComponent, Props } from 'jay-component';
import './todo.css';
import { JayEvent } from 'jay-runtime';
import { provideTodoContext } from './todo-context';

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
    const { addTodo, activeTodoCount, todos, clearCompleted, toggleAll } = provideTodoContext();

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
                addTodo(val);
            }
            setNewTodo('');
        }
    });

    refs.newTodo.oninput(({ event }: JayEvent<Event, TodoViewState>) =>
        setNewTodo((event.target as HTMLInputElement).value),
    );

    refs.clearCompleted.onclick((event) => {
        clearCompleted();
    });

    refs.toggleAll.onchange(({ event }: JayEvent<Event, TodoViewState>) =>
        toggleAll((event.target as HTMLInputElement).checked),
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
