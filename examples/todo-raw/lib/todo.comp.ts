import {render, ShownTodo, TodoViewState} from './todo.jay.html';
import {uuid} from "./uuid";

const ENTER_KEY = 13;
const ESCAPE_KEY = 27;

function Todo() {

    let data = {
        isFilterAll: false,
        isFilterActive: true,
        isFilterCompleted: false,
//        filter: ------------All | Active | Completed
        newTodo: '',
        todos: [
            {
                id: 'a1',
                title: 'a title 1',
                isEditing: false,
                editText: 'this is the edited text',
                isCompleted: false
            },
            {
                id: 'a2',
                title: 'a title 2',
                isEditing: false,
                editText: 'this is the edited text',
                isCompleted: false
            },
            {
                id: 'a3',
                title: 'a title 3',
                isEditing: false,
                editText: 'this is the edited text',
                isCompleted: true
            }]
    }

    function mkActiveTodoCount(): number {
        return data.todos.reduce(function (accum: number, todo: ShownTodo) {
            return todo.isCompleted ? accum : accum + 1;
        }, 0);
    }

    function computedData(): TodoViewState {
        let activeTodoCount = mkActiveTodoCount();
        return {
            ...data,
            activeTodoCount,
            noActiveItems: activeTodoCount === 0,
            activeTodoWord: activeTodoCount > 1 ? 'todos' : 'todo',
            hasItems: data.todos.length > 0,
            showClearCompleted: !!data.todos.find(_ => _.isCompleted),
            shownTodos: [...data.todos.filter(todo => {
                if (data.isFilterCompleted)
                    return todo.isCompleted
                else if (data.isFilterActive)
                    return !todo.isCompleted
                else
                    return true;
            })]
        };
    }

    function update() {
        jayElement.update(computedData())
    }


    let jayElement = render(computedData());
    let handleSubmit = todo => {
        let val = todo.editText.trim();
        if (val) {
            todo.title = val;
            todo.isEditing = false;
        } else {
            data.todos = data.todos.filter(_ => _ !== todo);
        }
    }
    let updateTitleFromEditing = todo => {
        todo.editText = (event.target as HTMLInputElement).value;
    }

    jayElement.refs.filterActive.onclick = (event) => {
        data.isFilterActive = true;
        data.isFilterAll = false;
        data.isFilterCompleted = false;
        update();
    }

    jayElement.refs.filterAll.onclick = (event) => {
        data.isFilterActive = false;
        data.isFilterAll = true;
        data.isFilterCompleted = false;
        update();
    }

    jayElement.refs.filterCompleted.onclick = (event) => {
        data.isFilterActive = false;
        data.isFilterAll = false;
        data.isFilterCompleted = true;
        update();
    }

    jayElement.refs.newTodo.onkeydown = (event) => {
        if (event.keyCode !== ENTER_KEY) {
            return;
        }

        event.preventDefault();

        data.newTodo = (jayElement.refs.newTodo as HTMLInputElement).value;
        let val = data.newTodo.trim();

        if (val) {
            data.todos.push({
                id: uuid(),
                title: val,
                isEditing: false,
                editText: '',
                isCompleted: false
            })
            update();
        }
        (jayElement.refs.newTodo as HTMLInputElement).value = '';
    }

    jayElement.refs.newTodo.onchange = (event) => {
        data.newTodo = (jayElement.refs.newTodo as HTMLInputElement).value;
        update();
    }

    jayElement.refs.clearCompleted.onclick = (event) => {
        data.todos = data.todos.filter(function (todo) {
            return !todo.isCompleted;
        });
        update();
    }
    
    jayElement.refs.completed.onchange = (event, todo) => {
        todo.isCompleted = !todo.isCompleted;
        update();
    }
    jayElement.refs.label.ondblclick = (event, todo) => {
        todo.isEditing = true;
        todo.editText = todo.title;
        update();
    }
    jayElement.refs.button.onclick = (event, todo) => {
        data.todos = data.todos.filter(_ => _ !== todo);
        update();
    }
    jayElement.refs.title.onblur = (event, todo) => {
        handleSubmit(todo);
        update();
    }
    jayElement.refs.title.onchange = (event, todo) => {
        updateTitleFromEditing(todo);
        update();
    }
    jayElement.refs.title.onkeydown = (event, todo) => {
        if (event.which === ESCAPE_KEY) {
            todo.editText = todo.title;
            todo.isEditing = false;
        } else if (event.which === ENTER_KEY) {
            handleSubmit(todo);
        }
        update();
    }
    jayElement.refs.toggleAll.onchange = (event) => {
        let completed = (jayElement.refs.toggleAll as HTMLInputElement).checked
        data.todos = data.todos.map(todo => ({...todo, isCompleted: completed}))
        update();
    }

    return {
        element: jayElement,
        update: () => {}
    }
}

export default function run(target) {
    let todoInstance = Todo();
    target.innerHTML = '';
    target.appendChild(todoInstance.element.dom);
}