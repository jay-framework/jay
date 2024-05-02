import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { Coordinate, JayEvent, JayEventHandler } from 'jay-runtime';
import { JayPortMessageType, eventInvocationMessage, JPMMessage } from 'jay-secure';
import { useSecureComponentContext } from './main-root.tsx';
import { deserialize, Deserialize } from 'jay-serialization';

export interface ComponentBridgeProps {
    coordinate: Coordinate;
}

type eventType = string;
type refName = string;
export type JayReactElementEvents = Record<eventType, JayEventHandler<any, any, any>>;
export type JayReactEvents = Record<refName, JayReactElementEvents>;

export interface JayReactComponentBridgeProps {
    viewState: any;
    events: JayReactEvents;
}

export function ComponentBridge<
    ViewState extends object,
    Props extends object,
    ElementProps extends JayReactComponentBridgeProps,
>(WrappedComponent: React.ComponentType<ElementProps>): React.FC<Props & ComponentBridgeProps> {
    return ({ coordinate, ...props }: ComponentBridgeProps & Props) => {
        const [viewState, setViewState] = useState<ViewState>(undefined);
        const { port, funcRepository, compId } = useSecureComponentContext();
        const [events, setEvents] = useState<JayReactEvents>({});
        const endpoint = port.getEndpoint(compId, coordinate);
        const [currentDeserialize, setCurrentDeserialize] = useState<Deserialize<ViewState>>(
            () => deserialize,
        );

        endpoint.onUpdate((message: JPMMessage) => {
            switch (message.type) {
                case JayPortMessageType.render:
                    const [deserializedViewState, nextDeserialize] = currentDeserialize(
                        message.patch,
                    );
                    setCurrentDeserialize(() => nextDeserialize);
                    flushSync(() => {
                        setViewState(deserializedViewState);
                    });
                    break;
                case JayPortMessageType.addEventListener:
                    {
                        const { eventType, nativeId } = message;
                        const eventHandler = (event: JayEvent<any, any>) => {
                            port.batch(() => {
                                if (message.nativeId) {
                                    let eventData = (
                                        funcRepository[nativeId] as JayEventHandler<any, any, any>
                                    )(event);
                                    endpoint.post(
                                        eventInvocationMessage(
                                            eventType,
                                            event.coordinate,
                                            eventData,
                                        ),
                                    );
                                } else
                                    endpoint.post(
                                        eventInvocationMessage(eventType, event.coordinate),
                                    );
                            });
                        };

                        events[message.refName] = {
                            ...events[message.refName],
                            [eventType]: eventHandler,
                        };
                        setEvents(events);
                    }
                    break;
            }
        });
        // implement main-bridge
        return port.batch(() => {
            if (viewState === undefined) return null;
            const elementProps: ElementProps = { viewState, events } as ElementProps;
            return <WrappedComponent {...elementProps} />;
        });
    };
}
