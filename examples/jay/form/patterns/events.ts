import { JayEvent } from '@jay-framework/runtime';

function inputValuePattern({ event }: JayEvent<any, any>) {
    return event.target.value;
}
