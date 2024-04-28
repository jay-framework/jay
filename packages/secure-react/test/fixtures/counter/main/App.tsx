import * as React from "react";
import {CounterBridge} from "./counter.tsx";
import {JayReactMainRoot} from "../../../../lib/main-root.tsx";


export default function App() {
    return (
        <JayReactMainRoot viewState={{initialCount: 12}}>
            <CounterBridge initialCount={12} coordinate={["comp1"]}/>
        </JayReactMainRoot>
    )
}