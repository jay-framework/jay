import { FunctionsRepository } from 'jay-secure';
import { JayEvent } from 'jay-runtime';

const ENTER_KEY = 13;

export const funcRepository: FunctionsRepository = {
    '1': ({ event }: JayEvent<Event, any>) => (event.target as HTMLInputElement).value,
    '2': ({ event }: JayEvent<KeyboardEvent, any>) => event.which,
    '3': ({ event }: JayEvent<KeyboardEvent, any>) => {
        event.keyCode === ENTER_KEY ? event.preventDefault() : '';
        return event.keyCode;
    },
    '4': ({ event }: JayEvent<Event, any>) => (event.target as HTMLInputElement).value,
    '5': ({ event }: JayEvent<Event, any>) => (event.target as HTMLInputElement).checked,
};
