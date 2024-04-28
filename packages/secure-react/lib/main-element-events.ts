import * as React from "react";
import {JayEventHandler, Coordinate} from "jay-runtime";
import {JayReactElementEvents} from './main-bridge';

const eventJayToReactMap = {
    click: 'onClick'
}

export function jayEventHandlerToReact(viewState: any, coordinate, eventType: string, handler: JayEventHandler<any, any, any>):
    React.EventHandler<React.SyntheticEvent<any, any>> {
    return handler ?
        React.useCallback(
            (event) => {
                return handler({coordinate, event: eventType, viewState});
            }, [viewState, ...coordinate, eventType]) : undefined
}

export function createElementFromJay(elType: string, viewState: any, coordinate: Coordinate, props: Record<string, any>, events: JayReactElementEvents, ...children: React.ReactNode[]): React.ReactNode {
    const allProps = {
        ...props,
        ...Object.fromEntries(Object.entries(events || {}).map(([eventType, handler]) => {
            const reactEventType = eventJayToReactMap[eventType]
            const reactHandler = jayEventHandlerToReact(viewState, coordinate, eventType, handler)
            return [reactEventType, reactHandler]
        }))
    }
    return React.createElement(elType, allProps, ...children);
}
