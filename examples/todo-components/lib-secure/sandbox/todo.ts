import {Filter, render, ShownTodo, TodoElementRefs, TodoViewState} from './todo.jay.html';
import {createMemo, createState, makeJayComponent, Props} from 'jay-component';
import {mutableObject} from 'jay-mutable';
import {uuid} from "./uuid";
import {$handler} from "jay-secure/dist/$func";

const ENTER_KEY = 13;

export interface TodoItem {
    id: string,
    title: string,
    isCompleted: boolean
}

export interface TodoProps {
    initialTodos: Array<TodoItem>
}

function TodoComponentConstructor({initialTodos}: Props<TodoProps>, refs: TodoElementRefs) {

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

    refs.filterActive.onclick(() => setFilter(Filter.active))
    refs.filterCompleted.onclick(() => setFilter(Filter.completed))
    refs.filterAll.onclick(() => setFilter(Filter.all))

    refs.newTodo
        .$onkeydown($handler<KeyboardEvent, TodoViewState, any>('3'))
        .then(({event: keyCode}) => {
            if (keyCode !== ENTER_KEY)
                return;

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
        })

    refs.newTodo
        .$oninput($handler<Event, TodoViewState, any>('4'))
        .then(({event: value}) => {
            setNewTodo(value)
        })


    refs.clearCompleted.onclick((event) => {
        setTodos(todos().filter(function (todo) {
            return !todo.isCompleted;
        }));
    })

    refs.items.onCompletedToggle(({event: newCompleted, viewState: item}) => {
        item.isCompleted = newCompleted
    })

    refs.items.onTitleChanged(({event: newTitle, viewState: item}) => {
        item.title = newTitle
    })

    refs.items.onRemove(({viewState: item}) => {
        setTodos(todos().filter(_ => _ !== item));
    })

    refs.toggleAll
        .$onchange($handler<Event, TodoViewState, any>('5'))
        .then(({event: completed}) => {
            setTodos(todos().map(todo => ({...todo, isCompleted: completed})))
        })

    return {
        render: () => ({
            activeTodoCount, noActiveItems, activeTodoWord, hasItems, showClearCompleted, shownTodos,
            filter, newTodo
        })
    }
}

export const TodoComponent = makeJayComponent(render, TodoComponentConstructor)
