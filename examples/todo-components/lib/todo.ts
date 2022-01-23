import {Filter, render, ShownTodo, TodoRefs} from './todo.jay.html';
import {createMemo, createState, makeJayComponent, Props} from 'jay-component';
import {mutableObject} from 'jay-reactive';
import {uuid} from "./uuid";

const ENTER_KEY = 13;

interface TodoItem {
    id: string,
    title: string,
    isCompleted: boolean
}

interface TodoProps {
    initialTodos: Array<TodoItem>
}

function TodoComponentConstructor({initialTodos}: Props<TodoProps>, refs: TodoRefs) {

    const [todos, setTodos] = createState(mutableObject(
        initialTodos().map(_ => ({..._, isEditing: false, editText: ''}))));

    const activeTodoCount = createMemo(() =>
        todos().reduce(function (accum: number, todo: ShownTodo) {
            return todo.isCompleted ? accum : accum + 1;
        }, 0))

    const noActiveItems = createMemo(() => activeTodoCount() === 0);
    const activeTodoWord = createMemo(() => activeTodoCount() > 1 ? 'todos' : 'todo');
    const hasItems = createMemo(() => todos().length > 0);
    const showClearCompleted = createMemo(() => !!todos().find(_ => _.isCompleted));
    const [filter, setFilter] = createState<Filter>(Filter.all);
    const [newTodo, setNewTodo] = createState('');

    const shownTodos = createMemo(() => [...todos().filter(todo => {
        if (filter() === Filter.completed)
            return todo.isCompleted
        else if (filter() === Filter.active)
            return !todo.isCompleted
        else
            return true;
    })]);

    refs.filterActive.onclick = () => setFilter(Filter.active)
    refs.filterCompleted.onclick = () => setFilter(Filter.completed)
    refs.filterAll.onclick = () => setFilter(Filter.all)

    refs.newTodo.onkeydown = (event) => {
        if (event.keyCode !== ENTER_KEY) {
            return;
        }

        event.preventDefault();

        let newValue = newTodo();
        let val = newValue.trim();

        if (val) {
            todos().push({
                id: uuid(),
                title: val,
                isEditing: false,
                editText: '',
                isCompleted: false
            })
        }
        setNewTodo('');
    }

    refs.newTodo.oninput = (event) => setNewTodo((refs.newTodo as HTMLInputElement).value)

    refs.clearCompleted.onclick = (event) => {
        setTodos(todos().filter(function (todo) {
            return !todo.isCompleted;
        }));
    }

    refs.items.onCompletedToggle = (newCompleted: boolean, item: ShownTodo) => {
        item.isCompleted = newCompleted
    }

    refs.items.onTitleChanged = (newTitle: string, item: ShownTodo) => {
        item.title = newTitle
    }

    refs.items.onRemove = (_, item: ShownTodo) => {
        setTodos(todos().filter(_ => _ !== item));
    }

    refs.toggleAll.onchange = (event) => {
        let completed = (refs.toggleAll as HTMLInputElement).checked
        setTodos(todos().map(todo => ({...todo, isCompleted: completed})))
    }

    return {
        render: () => ({
            activeTodoCount, noActiveItems, activeTodoWord, hasItems, showClearCompleted, shownTodos,
            filter, newTodo
        })
    }
}

export const TodoComponent = makeJayComponent(render, TodoComponentConstructor)
