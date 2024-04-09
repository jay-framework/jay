// import { BaseJayElement, provideContext } from 'jay-runtime';
import { useMainPort } from 'jay-secure';
// import { SECURE_COMPONENT_MARKER } from './main-contexts';
import {
    JayPortMessageType,
    nativeExecResult,
    rootComponentViewState,
} from 'jay-secure';
import {Serialize, serialize} from 'jay-serialization';
import { FunctionsRepository, JayGlobalNativeFunction } from 'jay-secure';
import { JSONPatch } from 'jay-json-patch';
import {createContext, useContext, useEffect, useState} from "react";

export interface MainRootProps<ViewState> {
    children,
    viewState: ViewState,
    funcRepository?: FunctionsRepository
}

const SECURE_COMPONENT_CONTEXT = createContext(null);

export const useSecureComponentContext = () => {
    return useContext(SECURE_COMPONENT_CONTEXT);
};
export function JayReactMainRoot<ViewState>({children, viewState, funcRepository}: MainRootProps<ViewState>) {

    let port = useMainPort();
    let endpoint = port.getRootEndpoint();
    let context = { compId: endpoint.compId, endpoint, port, funcRepository };

    const [currentSerialize, setCurrentSerialize] = useState(undefined);
    useEffect(() => {
        let patch: JSONPatch, nextSerialize: Serialize;
        if (!currentSerialize) {
            [patch, nextSerialize] = serialize(viewState);
        }
        else {
            [patch, nextSerialize] = currentSerialize(viewState);
        }
        setCurrentSerialize(nextSerialize);
        endpoint.post(rootComponentViewState(patch));
    }, [viewState]);

    endpoint.onUpdate(async (message) => {
        switch (message.type) {
            case JayPortMessageType.nativeExec: {
                let { nativeId, correlationId } = message;
                try {
                    let result = await (funcRepository[nativeId] as JayGlobalNativeFunction<any>)();
                    port.batch(async () => {
                        endpoint.post(nativeExecResult(correlationId, result, undefined));
                    });
                } catch (err) {
                    port.batch(async () => {
                        endpoint.post(nativeExecResult(correlationId, undefined, err.message));
                    });
                }
                break;
            }
        }
    });

    return (
        <SECURE_COMPONENT_CONTEXT.Provider value={context}>
            {children}
        </SECURE_COMPONENT_CONTEXT.Provider>
    );
}
