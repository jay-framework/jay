import {render} from "./counter.jay.html";
import {makeJayComponentBridge} from "../../../../lib/main/main-bridge";

export interface CounterProps {
    title: string
    initialCount: number
    id: string
}

export const Counter = makeJayComponentBridge(render, {events: ['onChange'], functions: ['counterDescription']});