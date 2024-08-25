import { element as e, dynamicText as dt } from '../../lib/element';
import { ConstructContext } from '../../lib/context';
import {ReferencesManager} from "../../lib";

describe('text-element', () => {
    interface ViewState {
        firstName: string;
        lastName: string;
        age: number;
        graduated: boolean;
    }

    const initial: ViewState = {
        firstName: 'John',
        lastName: 'smith',
        age: 28,
        graduated: false,
    };
    const updatedName: ViewState = { ...initial, firstName: 'Terry' };
    const updatedNameAndGraduate: ViewState = { ...updatedName, graduated: true };

    it('should render string as text', () => {
        let [refManager, []] =
            ReferencesManager.for({}, [], [], [], []);
        let jayElement = ConstructContext.withRootContext(initial, refManager, () =>
            e('div', { className: 'item' }, [dt((vs) => vs.firstName)]),
        );
        expect(jayElement.dom).toHaveTextContent(initial.firstName);
    });

    it('should update string as text', () => {
        let [refManager, []] =
            ReferencesManager.for({}, [], [], [], []);
        let jayElement = ConstructContext.withRootContext(initial, refManager, () =>
            e('div', { className: 'item' }, [dt((vs) => vs.firstName)]),
        );
        jayElement.update(updatedName);
        expect(jayElement.dom).toHaveTextContent(updatedName.firstName);
    });

    it('should render complex string as text', () => {
        let [refManager, []] =
            ReferencesManager.for({}, [], [], [], []);
        let jayElement = ConstructContext.withRootContext(initial, refManager,() =>
            e('div', { className: 'item' }, [
                dt(
                    (vs) =>
                        `${vs.firstName} ${vs.lastName} - age: ${vs.age}, did ${
                            vs.graduated ? '' : 'not'
                        } graduate`,
                ),
            ]),
        );
        expect(jayElement.dom).toHaveTextContent('John smith - age: 28, did not graduate');
    });

    it('should render complex string as text', () => {
        let [refManager, []] =
            ReferencesManager.for({}, [], [], [], []);
        let jayElement = ConstructContext.withRootContext(initial, refManager,() =>
            e('div', { className: 'item' }, [
                dt(
                    (vs) =>
                        `${vs.firstName} ${vs.lastName} - age: ${vs.age}, did ${
                            vs.graduated ? '' : 'not'
                        } graduate`,
                ),
            ]),
        );
        jayElement.update(updatedNameAndGraduate);
        expect(jayElement.dom).toHaveTextContent('Terry smith - age: 28, did graduate');
    });
});
