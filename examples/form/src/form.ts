import { render, FormElementRefs } from './form.jay-html';
import { createState, makeJayComponent, Props } from 'jay-component';
import {JayEvent} from "jay-runtime";

export interface CounterProps {
    initialValue: number;
}

function FormConstructor({ initialValue }: Props<CounterProps>, refs: FormElementRefs) {
    let [firstName, setFirstName] = createState('');
    let [lastName, setLastName] = createState('');
    let [greeting, setGreeting] = createState('');

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
