import {render} from './todo.jay.html';

function Todo() {

    let data = {
        activeTodoCount: 3,
        activeTodoWord: 'todos',
        hasItems: true,
//        filter: ------------All | Active | Completed
        showClearCompleted: true,
        newTodo: 'this is a new todo item',
        shownTodos: [
            {
                id: 'a1',
                title: 'a title 1',
                editing: false,
                editText: 'this is the edited text',
                completed: false
            },
            {
                id: 'a2',
                title: 'a title 2',
                editing: true,
                editText: 'this is the edited text',
                completed: false
            },
            {
                id: 'a3',
                title: 'a title 3',
                editing: false,
                editText: 'this is the edited text',
                completed: true
            }]

    }

    let jayElement = render(data);
    return {
        element: jayElement,
        update: () => {}
    }
}

export default function run(target, cycles, progressCallback) {
    let counter = Todo();
    target.innerHTML = '';
    target.appendChild(counter.element.dom);

}