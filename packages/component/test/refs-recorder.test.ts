import {describe, expect, it, jest} from '@jest/globals'
import {DynamicReference} from 'jay-runtime';
import {applyToRefs, PRINCIPAL, refsRecorder} from "../lib/refs-recorder";

describe('refs recorder', () => {
    interface Item {}
    interface TestRefs {
        one: DynamicReference<Item>,
        two: HTMLElement
    }
    const clickOne = () => void {};
    const clickTwo = () => void {};

    it('should create a reference recorder', () => {
        let refs: TestRefs = refsRecorder();
        expect(refs.one).toBeDefined();
        expect(refs.two).toBeDefined();
    })

    it('should record onclick', () => {
        let refs: TestRefs = refsRecorder();
        refs.one.onclick = clickOne;
        refs.two.onclick = clickTwo;

        expect(refs[PRINCIPAL].one[PRINCIPAL].onclick).toBe(clickOne)
        expect(refs[PRINCIPAL].two[PRINCIPAL].onclick).toBe(clickTwo)
    })

    it('should wrap onclick handlers', () => {
        let wrapperBeforeInvocations = 0;
        let wrapperAfterInvocations = 0;
        let wrapper = func => (...args) => {
            wrapperBeforeInvocations += 1;
            func(...args);
            wrapperAfterInvocations += 1;
        }
        let refs: TestRefs = refsRecorder();
        refs.one.onclick = clickOne;

        let elementRefs = {
            one: {},
            two: {}
        } as TestRefs

        applyToRefs(refs, elementRefs, wrapper)

        elementRefs.one.onclick(null, null);

        expect(wrapperBeforeInvocations).toBe(1)
        expect(wrapperAfterInvocations).toBe(1)
    })

    it('should apply the references to the element', () => {
        let refs: TestRefs = refsRecorder();
        refs.one.onclick = clickOne;
        refs.two.onclick = clickTwo;

        let elementRefs = {
            one: {},
            two: {}
        } as TestRefs

        applyToRefs(refs, elementRefs)

        expect(elementRefs.one.onclick).toBe(clickOne)
        expect(elementRefs.two.onclick).toBe(clickTwo)
    })

});

