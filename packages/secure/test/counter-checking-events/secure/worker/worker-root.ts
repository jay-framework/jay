import {Counter} from "./counter";
import {workerRoot} from "../../../../lib/sandbox/worker-root";

export function initializeWorker() {
    workerRoot(Counter)
}