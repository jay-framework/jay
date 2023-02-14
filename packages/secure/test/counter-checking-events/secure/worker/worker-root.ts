import {Counter} from "./counter";
import {workerRoot} from "../../../../lib/worker-root";

export function initializeWorker() {
    workerRoot(Counter)
}