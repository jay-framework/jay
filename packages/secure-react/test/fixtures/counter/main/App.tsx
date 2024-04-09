import * as React from "react";
import {Counter} from "./counter.tsx";
import {JayReactMainRoot} from "../../../../lib/main-root.tsx";


export default function App() {
    return (
        <JayReactMainRoot viewState={{}}>
            <Counter initialCount={12}/>
        </JayReactMainRoot>
    )
}