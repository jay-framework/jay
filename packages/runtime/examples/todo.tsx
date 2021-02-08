import Events from '../src/jay'

interface TodoItem {
    id: String
    title: String
    editing: Boolean
    editText: String
    completed: Boolean
    completedEvents: Events
    labelEvents: Events
    buttonEvents: Events
    titleEvents: Events
}
interface ViewState {
    activeTodoCount: number
    activeTodoWord: string
    hasItems: boolean
    filter: 'All' | 'Active' | 'Completed'
    showClearCompleted: boolean
    clearCompletedEvents: Events
    newTodo: string
    newTodoEvents: Events
    toggleAllEvents: Events
    shownTodos: Array<TodoItem>
}

export default function render(viewState: ViewState) {
    return (
        <div>
            <header class="header">
                <h1 class="main-title">todos</h1>
                <input class="new-todo" placeholder="What needs to be done?" value={viewState.newTodo} events={viewState.newTodoEvents} autofocus/>
            </header>
            <section class="main" if={viewState.hasItems}>
                <input id="toggle-all" class="toggle-all" type="checkbox" events={viewState.toggleAllEvents} value={viewState.activeTodoCount==0}/>
                <label for="toggle-all"/>
                <ul class="todo-list">
                    <li classNames={{completed: todo.completed, editing: todo.editing }} forEach={viewState.shownTodos} item={todo} trackBy={todo.id}>
                        <div class="view">
                            <input class="toggle" type="checkbox" value={todo.completed} events={todo.completedEvents}/>
                            <label events={todo.labelEvents}>{todo.title}</label>
                            <button events={todo.buttonEvents} class="destroy"/>
                        </div>
                        <input class="edit" value={todo.editText} events={todo.titleEvents}/>
                    </li>
                </ul>
            </section>)
            <footer class="footer" if={viewState.hasItems}>
                    <span class="todo-count">
                        <strong>{viewState.activeTodoCount}</strong><span> </span><span>{viewState.activeTodoWord}</span><span> left</span>
                    </span>
                <ul class="filters">
                    <li>
                        <a href="#/" classNames={{selected: viewState.filter == 'All' }}>All</a>
                    </li>
                    <span> </span>
                    <li>
                        <a href="#/active" classNames={{ selected: viewState.filter == 'Active' }}>Active</a>
                    </li>
                    <span> </span>
                    <li>
                        <a href="#/completed" classNames={{ selected: viewState.filter == 'Completed' }}>Completed</a>
                    </li>
                </ul>
                <button class="clear-completed" events={viewState.clearCompletedEvents} if={viewState.showClearCompleted}>
                    Clear completed                                                                  ˆ
                </button>
            </footer>
        </div>
    );
}

