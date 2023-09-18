import {render} from "./counter.jay.html";
import {makeJayComponentBridge} from "jay-secure";

export interface CounterProps {
    initialCount: number
}

export const Counter = makeJayComponentBridge(render);