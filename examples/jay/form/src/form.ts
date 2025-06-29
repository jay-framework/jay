import { render, FormElementRefs } from './form.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';
import { JayEvent } from '@jay-framework/runtime';

export interface CounterProps {
    initialValue: number;
}

function FormConstructor({ initialValue }: Props<CounterProps>, refs: FormElementRefs) {
    let [firstName, setFirstName] = createSignal('');
    let [lastName, setLastName] = createSignal('');
    let [greeting, setGreeting] = createSignal('');

    refs.firstName.oninput(({ event }: JayEvent<any, any>) => setFirstName(event.target.value));
    refs.lastName.oninput(({ event }: JayEvent<any, any>) => setLastName(event.target.value));
    refs.submit.onclick(() => {
        setGreeting(`Hello ${firstName()} ${lastName()}, greeting from Jay secure component!!!`);
    });

    return {
        render: () => ({ firstName, lastName, greeting }),
    };
}

export const Form = makeJayComponent(render, FormConstructor);
