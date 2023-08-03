import {Filter, render, ShownTodo, TodoElementRefs} from './todo.jay.html';
import {createMemo, createState, makeJayComponent, Props} from 'jay-component';
import {uuid} from "./uuid";
import {patch} from "jay-serialization";
import {ADD, JSONPatch, REPLACE} from "jay-serialization/dist/types";
import {Getter, Setter, ValueOrGetter} from "jay-reactive";

const ENTER_KEY = 13;
const ESCAPE_KEY = 27;

interface TodoItem {
    id: string,
    title: string,
    isCompleted: boolean
}

interface TodoProps {
    initialTodos: Array<TodoItem>
}
//
// type Patcher<T> = (patch: JSONPatch) => void
// function createPatchableState<T>(value: ValueOrGetter<T>): [get: Getter<T>, patchFunc: Patcher<T>] {
//     const [get, set] = createState(value)
//     const patchFunc = (jsonPatch: JSONPatch) =>
//         set(patch(get(), jsonPatch));
//     return [get, patchFunc]
// }

function TodoComponentConstructor({initialTodos}: Props<TodoProps>, refs: TodoElementRefs) {

    const [todos, setTodos] = createState(
        initialTodos().map(_ => ({..._, isEditing: false, editText: ''})));

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

    let handleSubmit = todo => {
        let val = todo.editText.trim();
        if (val) {
            let itemIndex = todos().findIndex(_ => _.id === todo.id)
            setTodos(patch(todos(), [
                {op: REPLACE, path: [itemIndex, 'title'], value: val},
                {op: REPLACE, path: [itemIndex, 'isEditing'], value: false}
            ]))
        } else {
            setTodos(todos().filter(_ => _ !== todo));
        }
    }

    refs.filterActive.onclick(() => setFilter(Filter.active))
    refs.filterCompleted.onclick(() => setFilter(Filter.completed))
    refs.filterAll.onclick(() => setFilter(Filter.all))

    refs.newTodo
        .$onkeydown(({event}) => {
            (event.keyCode === ENTER_KEY)?event.preventDefault():''
            return event.keyCode;
        })
        .then(({event: keyCode}) => {
            if (keyCode !== ENTER_KEY)
                return;

            let newValue = newTodo();
            let val = newValue.trim();

            if (val) {
                setTodos(patch(todos(), [{
                    op: ADD, path: [todos().length],
                    value: {
                        id: uuid(),
                        title: val,
                        isEditing: false,
                        editText: '',
                        isCompleted: false
                    }}]))
            }
            setNewTodo('');
        })

    refs.newTodo
        .$oninput(({event}) => (event.target as HTMLInputElement).value)
        .then(({event: value}) => {
            setNewTodo(value)
        })

    refs.clearCompleted.onclick((event) => {
        setTodos(todos().filter(function (todo) {
            return !todo.isCompleted;
        }));
    })

    refs.completed.onchange(({viewState: todo}) => todo.isCompleted = !todo.isCompleted)
    refs.label.ondblclick(({viewState: todo}) => {
        let itemIndex = todos().findIndex(_ => _.id === todo.id)
        setTodos(patch(todos(), [
            {op: REPLACE, path: [itemIndex, 'editText'], value: todo.title},
            {op: REPLACE, path: [itemIndex, 'isEditing'], value: true}
        ]))
    })
    refs.button.onclick(({viewState: todo}) => {
        setTodos(todos().filter(_ => _ !== todo));
    })
    refs.title.onblur(({viewState: todo}) => {
        handleSubmit(todo);
    })
    refs.title
        .$onchange(({event}) => (event.target as HTMLInputElement).value)
        .then(({event: value, viewState: todo}) => {
            let itemIndex = todos().findIndex(_ => _.id === todo.id)
            setTodos(patch(todos(), [
                {op: REPLACE, path: [itemIndex, 'editText'], value}
            ]))
        })
    refs.title
        .$onkeydown(({event}) => (event.which))
        .then(({event:which, viewState: todo})=> {
            if (which === ESCAPE_KEY) {
                let itemIndex = todos().findIndex(_ => _.id === todo.id)
                setTodos(patch(todos(), [
                    {op: REPLACE, path: [itemIndex, 'editText'], value: todo.title},
                    {op: REPLACE, path: [itemIndex, 'editText'], value: false}
                ]))
            } else if (which === ENTER_KEY) {
                handleSubmit(todo);
            }
        })
    refs.toggleAll
        .$onchange(({event}) => (event.target as HTMLInputElement).checked)
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
