import {describe, expect, it, jest} from '@jest/globals'
import {createReactive, createState} from "../lib/reactive";

describe('reactive', () => {

    describe('create reactive', () => {
        it('should call the constructor function', () => {
            const myMock = jest.fn();

            createReactive(() => {
                myMock()
            })

            expect(myMock.mock.calls.length).toBe(1);
        });

        it('should support createState', () => {
            let res;
            createReactive(() => {
                let [state, setState] = createState(12);
                res = state();
            })

            expect(res).toBe(12);
        });

        it('should support createState state update with a value', () => {
            let res;
            createReactive(() => {
                let [state, setState] = createState(12);
                setState(13)
                res = state();
            })

            expect(res).toBe(13);
        });

        it('should support createState state update with a function', () => {
            let res;
            createReactive(() => {
                let [state, setState] = createState(12);
                setState(x => x+1)
                res = state();
            })

            expect(res).toBe(13);
        });
    });
});
