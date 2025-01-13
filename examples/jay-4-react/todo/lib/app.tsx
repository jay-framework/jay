import 'react';
import { jay2React } from 'jay-4-react';
import { TodoComponent, TodoItem, TodoProps } from './todo';

const ReactTodoApp = jay2React(() => TodoComponent);

interface AppProps {
    initialTodos: Array<TodoItem>;
}

export function App({ initialTodos }: AppProps) {
    return (
        <div>
            <ReactTodoApp initialTodos={initialTodos} />
        </div>
    );
}
