import {render, ShownTodo, TodoRefs} from './todo.jay.html';
import {createMemo, createState, makeJayComponent, Props} from 'jay-component';
import { mutableObject } from 'jay-reactive';

const ENTER_KEY = 13;
const ESCAPE_KEY = 27;

function uuid() {
    /*jshint bitwise:false */
    var i, random;
    var uuid = '';

    for (i = 0; i < 32; i++) {
        random = Math.random() * 16 | 0;
        if (i === 8 || i === 12 || i === 16 || i === 20) {
            uuid += '-';
        }
        uuid += (i === 12 ? 4 : (i === 16 ? (random & 3 | 8) : random))
            .toString(16);
    }

    return uuid;
}

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
    const [filter, setFilter] = createState('all');
    const isFilterAll = createMemo(() => filter() === 'all');
    const isFilterActive = createMemo(() => filter() === 'active');
    const isFilterCompleted = createMemo(() => filter() === 'completed');
    const [newTodo, setNewTodo] = createState('');

    const shownTodos = createMemo(() => [...todos().filter(todo => {
        if (isFilterCompleted())
            return todo.isCompleted
        else if (isFilterActive())
            return !todo.isCompleted
        else
            return true;
    })]);

    let handleSubmit = todo => {
        let val = todo.editText.trim();
        if (val) {
            todo.title = val;
            todo.isEditing = false;
        } else {
            setTodos(todos().filter(_ => _ !== todo));
        }
    }

    refs.filterActive.onclick = () => setFilter('active')
    refs.filterCompleted.onclick = () => setFilter('completed')
    refs.filterAll.onclick = () => setFilter('all')

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

    refs.completed.onchange = (event, todo) => todo.isCompleted = !todo.isCompleted;
    refs.label.ondblclick = (event, todo) => {
        todo.isEditing = true;
        todo.editText = todo.title;
    }
    refs.button.onclick = (event, todo) => {
        setTodos(todos().filter(_ => _ !== todo));
    }
    refs.title.onblur = (event, todo) => {
        handleSubmit(todo);
    }
    refs.title.onchange = (event, todo) => {
        todo.editText = (event.target as HTMLInputElement).value;
    }
    refs.title.onkeydown = (event, todo) => {
        if (event.which === ESCAPE_KEY) {
            todo.editText = todo.title;
            todo.isEditing = false;
        } else if (event.which === ENTER_KEY) {
            handleSubmit(todo);
        }
    }
    refs.toggleAll.onchange = (event) => {
        let completed = (refs.toggleAll as HTMLInputElement).checked
        setTodos(todos().map(todo => ({...todo, isCompleted: completed})))
    }

    return {
        render: () => ({
            activeTodoCount, noActiveItems, activeTodoWord, hasItems, showClearCompleted, shownTodos,
            isFilterAll, isFilterActive, isFilterCompleted, newTodo
        })
    }
}

const TodoComponent = makeJayComponent(render, TodoComponentConstructor)

const initialTodos = [
    {
        id: 'a1',
        title: 'a title 1',
        isCompleted: false
    },
    {
        id: 'a2',
        title: 'a title 2',
        isCompleted: false
    },
    {
        id: 'a3',
        title: 'a title 3',
        isCompleted: true
    }];

export default function run(target, cycles, progressCallback) {
    let instance = TodoComponent({initialTodos});
    target.innerHTML = '';
    target.appendChild(instance.element.dom);

}