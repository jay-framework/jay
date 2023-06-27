import {useWorkerPort} from "../comm-channel/comm-channel";
import {nativeExec} from "../comm-channel/messages";
import {$JayGlobalNativeFunction, JayGlobalNativeFunction} from "../main/function-repository-types";
import {correlatedPromise} from "../$func";

export function exec$<R>(handler: JayGlobalNativeFunction<R>): Promise<R> {
    let port = useWorkerPort()
    return port.batch(() => {
        let {$execPromise, correlationId} = correlatedPromise<R>();
        port.getRootEndpoint().post(nativeExec((handler as $JayGlobalNativeFunction<R>).id, correlationId))
        return $execPromise
    })

}