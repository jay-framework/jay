import {render} from "./counter.jay.html";
import {makeJayComponentBridge} from "../../../../lib/component-bridge";

export interface CounterProps {
    title: string
    initialCount: number
}

export const Counter = makeJayComponentBridge(render);