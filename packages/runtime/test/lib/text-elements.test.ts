import {
    element as e,
    dynamicText as dt, ConstructContext
} from '../../lib/element';
import {describe, it} from '@jest/globals'
import {expectE} from "./test-utils";

describe('text-element', () => {

    interface ViewState {
        firstName: string,
        lastName: string,
        age: number,
        graduated: boolean,
    }

    const initial: ViewState = {
        firstName: 'John',
        lastName: 'smith',
        age: 28,
        graduated: false
    }
    const updatedName: ViewState = {...initial, firstName: 'Terry'}
    const updatedNameAndGraduate: ViewState = {...updatedName, graduated: true}

    it('should render string as text', () => {
        let jayElement = ConstructContext.withRootContext(initial, () =>
            e('div', {"className": 'item'}, [dt(
                vs => vs.firstName)])
        );
        expectE(jayElement.dom).toHaveTextContent(initial.firstName)
    })

    it('should update string as text', () => {
        let jayElement = ConstructContext.withRootContext(initial, () =>
        e('div', {"className": 'item'}, [dt(
            vs => vs.firstName)])
        );
        jayElement.update(updatedName);
        expectE(jayElement.dom).toHaveTextContent(updatedName.firstName)
    })

    it('should render complex string as text', () => {
        let jayElement = ConstructContext.withRootContext(initial, () =>
            e('div', {"className": 'item'}, [dt(
                vs => `${vs.firstName} ${vs.lastName} - age: ${vs.age}, did ${vs.graduated?'':'not'} graduate`)])
        );
        expectE(jayElement.dom).toHaveTextContent('John smith - age: 28, did not graduate');
    })

    it('should render complex string as text', () => {
        let jayElement = ConstructContext.withRootContext(initial, () =>
            e('div', {"className": 'item'}, [dt(
            vs => `${vs.firstName} ${vs.lastName} - age: ${vs.age}, did ${vs.graduated?'':'not'} graduate`)])
        );
        jayElement.update(updatedNameAndGraduate);
        expectE(jayElement.dom).toHaveTextContent('Terry smith - age: 28, did graduate');
    })
});

