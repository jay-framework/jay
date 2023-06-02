import {render} from "./counter.jay.html";
import {makeJayComponentBridge} from "jay-secure";

export interface CounterProps {
    title: string
    initialCount: number
}

export const Counter = makeJayComponentBridge(render);