import {Counter} from "./counter";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";

export function initializeWorker() {
    sandboxRoot(Counter)
}