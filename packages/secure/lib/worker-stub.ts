import {JayPort, usePort} from "./comm-channel";
import {BasicViewState} from "../test/basic/secure/worker/basic.jay.html";


export function workerStub(compId: string, viewState: any) {
    let port: JayPort = usePort();
    port.post(compId, viewState);
    return {
        dom: null,
        update: (newData: BasicViewState) => {
            port.post(compId, newData);
        },
        mount: () => {},
        unmount: () => {},
        refs: {
        }
    }

}