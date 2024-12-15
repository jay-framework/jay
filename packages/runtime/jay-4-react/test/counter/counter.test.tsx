import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './main/App';

const VERBOSE = true;

describe('Simple react component', () => {
    async function mkElement() {
        render(<App />);
    }

    it('render a counter', async () => {
        await mkElement();

        // screen.debug();
        // fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('value')).toHaveTextContent('12');
    });

    it('counter with button click - subtract', async () => {
        await mkElement();
        // screen.debug();
        fireEvent.click(screen.getByRole('sub'));
        expect(screen.getByRole('value')).toHaveTextContent('11');
    });

    it('counter with multiple button clicks - subtract, subtract, subtract, adder', async () => {
        await mkElement();
        // screen.debug();
        fireEvent.click(screen.getByRole('sub'));
        fireEvent.click(screen.getByRole('sub'));
        fireEvent.click(screen.getByRole('sub'));
        fireEvent.click(screen.getByRole('add'));
        expect(screen.getByRole('value')).toHaveTextContent('10');
    });
});
