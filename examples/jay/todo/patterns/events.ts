import { JayEvent } from '@jay-framework/runtime';

function inputValuePattern({ event }: JayEvent<any, any>) {
    return event.target.value;
}

function inputCheckedPattern({ event }: JayEvent<any, any>) {
    return event.target.checked;
}

function eventKeyCode({ event }: JayEvent<any, any>): number {
    return event.keyCode;
}

function eventWhich({ event }: JayEvent<any, any>): number {
    return event.which;
}

function eventPreventDefault({ event }: JayEvent<any, any>) {
    event.preventDefault();
}
