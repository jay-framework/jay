import React, {useState} from "react";
import { flushSync } from 'react-dom';
import {Coordinate} from "jay-runtime";
import {JayPortMessageType, JPMMessage} from "jay-secure";
import {useSecureComponentContext} from "./main-root.tsx";
import {deserialize, Deserialize} from "jay-serialization";

export interface ComponentBridgeProps {
    coordinate: Coordinate
}

export function ComponentBridge<ViewState extends object, Props extends object>(
    WrappedComponent: React.ComponentType<ViewState>
): React.FC<Props & ComponentBridgeProps> {
    return ({coordinate, ...props}: ComponentBridgeProps & Props) => {
        const [viewState, setViewState] = useState<ViewState>({});
        const {port, funcRepository, compId } = useSecureComponentContext();
        let endpoint = port.getEndpoint(compId, coordinate);

        let deserializedViewState: ViewState,
            nextDeserialize: Deserialize<ViewState> = deserialize;

        endpoint.onUpdate((message: JPMMessage) => {
            switch (message.type) {
                case JayPortMessageType.render:
                    [deserializedViewState, nextDeserialize] = nextDeserialize(message.patch);
                    flushSync(() => {
                        setViewState(deserializedViewState);
                    })
                    break;
            }
        });
        // implement main-bridge
        return port.batch(() => {
            return <WrappedComponent {...viewState} />;
        })
    };
}