import { EventEmitter, JayEventHandler } from '@jay-framework/runtime';

export function mkComponentEventHandler<EventType, PropsType>(): EventEmitter<
    EventType,
    PropsType
> {
    let eventDefinition: EventEmitter<EventType, PropsType>;
    let _handler: JayEventHandler<EventType, PropsType, void>;
    eventDefinition = function (handler: JayEventHandler<EventType, PropsType, void>) {
        _handler = handler;
    } as EventEmitter<EventType, PropsType>;
    eventDefinition.emit = (event: EventType) =>
        _handler &&
        _handler({
            event,
            viewState: undefined,
            coordinate: undefined,
        });
    return eventDefinition;
}
