import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import {vi} from "vitest";

describe('Simple react component', () => {
    async function mkElement() {
        const onCounterChange = vi.fn()
        render(<App onCounterChange={onCounterChange}/>);
        return {onCounterChange}
    }

    it('render a counter', async () => {
        await mkElement();

        // screen.debug();
        expect(screen.getByRole('value')).toHaveTextContent('12');
    });

    it('counter with button click - subtract', async () => {
        const {onCounterChange} = await mkElement();
        // screen.debug();
        fireEvent.click(screen.getByRole('sub'));
        expect(screen.getByRole('value')).toHaveTextContent('11');
        expect(onCounterChange).toHaveBeenCalledTimes(1);
        expect(onCounterChange).toHaveBeenCalledWith('counter new value: 11')
    });

    it('counter with multiple button clicks - subtract, subtract, subtract, adder', async () => {
        const {onCounterChange} = await mkElement();
        // screen.debug();
        fireEvent.click(screen.getByRole('sub'));
        fireEvent.click(screen.getByRole('sub'));
        fireEvent.click(screen.getByRole('sub'));
        fireEvent.click(screen.getByRole('add'));
        expect(screen.getByRole('value')).toHaveTextContent('10');
        expect(onCounterChange).toHaveBeenCalledTimes(4);
        expect(onCounterChange).toHaveBeenNthCalledWith(1,'counter new value: 11')
        expect(onCounterChange).toHaveBeenNthCalledWith(2,'counter new value: 10')
        expect(onCounterChange).toHaveBeenNthCalledWith(3,'counter new value: 9')
        expect(onCounterChange).toHaveBeenNthCalledWith(4,'counter new value: 10')
    });
});
