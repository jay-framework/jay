import {Basic} from "./basic";
import {workerRoot} from "../../../../lib/worker-root";

export function initializeWorker() {
    workerRoot(Basic)
}