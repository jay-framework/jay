import {Counter} from "./counter";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";

export function initializeWorker() {
    sandboxRoot([
        {
            refName: 'a',
            compCreator: Counter,
            getProps: vs => ({title: 'first counter', initialCount: 12})
        }])
}