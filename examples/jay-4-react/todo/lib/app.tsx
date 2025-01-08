import 'react';
import {jay2React} from "jay-4-react";
import {TodoComponent, TodoItem, TodoProps} from "./todo";
import {useRef} from "react";

const ReactTodoApp = jay2React(() => TodoComponent);

interface AppProps {
    initialTodos: Array<TodoItem>;
}

const MyComp = (props) => {
    console.log('before')
    useRef();
    ReactTodoApp({initialTodos: []})
    console.log('after')
    return (<div>hi</div>)
}

export function App({initialTodos}: AppProps) {
    return <div>
        {/*<MyComp></MyComp>*/}
        <ReactTodoApp initialTodos={initialTodos}/>
        {/*<span>hello world</span>*/}
    </div>
}
