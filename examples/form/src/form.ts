import { render, FormElementRefs } from './form.jay-html';
import { createState, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
    initialValue: number;
}

function FormConstructor({ initialValue }: Props<CounterProps>, refs: FormElementRefs) {
    let [firstName, setFirstName] = createState('');
    let [lastName, setLastName] = createState('');

    refs.firstName.oninput(({event}) => setFirstName(event.target.value))
    refs.lastName.oninput(({event}) => setLastName(event.target.value))
    refs.submit.onclick(() => {
        console.log(firstName(), lastName());
    })

    return {
        render: () => ({ firstName, lastName }),
    };
}

export const Form = makeJayComponent(render, FormConstructor);
