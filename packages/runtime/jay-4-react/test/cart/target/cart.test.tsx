import { fireEvent, render, screen } from '@testing-library/react';
import App, { AppProps } from './App';

const ITEM_A_1 = { name: 'item 1', price: 10, quantity: 1, id: 'a' };
const ITEM_A_2 = { name: 'item 1', price: 15, quantity: 3, id: 'a' };
const ITEM_B_1 = { name: 'item 2', price: 10, quantity: 2, id: 'b' };
const ITEM_C_1 = { name: 'item 3', price: 40, quantity: 7, id: 'c' };
const DEFAULT_PROPS: AppProps = {
    lineItems: [ITEM_A_1, ITEM_B_1],
    total: 30,
    minimumOrder: 20,
};

describe('cart testing conditions and collections', () => {
    async function mkElement(cartProps: AppProps = DEFAULT_PROPS) {
        const { rerender } = render(<App {...cartProps} />);
        // screen.debug();
        return { rerender };
    }

    it('render a full cart (a collection ) with enough line items (condition true)', async () => {
        await mkElement();

        // screen.debug();
        expect(screen.getByRole('condition')).toHaveTextContent('minimum order price reached');
        expect(screen.getByRole('lineItem-a')).toHaveTextContent('item 1, quantity:1, price:10, x');
        expect(screen.getByRole('lineItem-b')).toHaveTextContent('item 2, quantity:2, price:10, x');
        expect(screen.getByRole('total')).toHaveTextContent('Total: 30');
    });

    it('update a collection by updating input props', async () => {
        let { rerender } = await mkElement();

        rerender(<App total={345} minimumOrder={20} lineItems={[ITEM_A_2, ITEM_B_1, ITEM_C_1]} />);
        // screen.debug();
        // fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('condition')).toHaveTextContent('minimum order price reached');
        expect(screen.getByRole('lineItem-a')).toHaveTextContent('item 1, quantity:3, price:15, x');
        expect(screen.getByRole('lineItem-b')).toHaveTextContent('item 2, quantity:2, price:10, x');
        expect(screen.getByRole('lineItem-c')).toHaveTextContent('item 3, quantity:7, price:40, x');
        expect(screen.getByRole('total')).toHaveTextContent('Total: 345');
    });

    it('update to condition false', async () => {
        let { rerender } = await mkElement();

        rerender(<App total={10} minimumOrder={20} lineItems={[ITEM_A_1]} />);
        // screen.debug();
        // fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('condition')).toHaveTextContent('minimum order value not reached');
        expect(screen.getByRole('lineItem-a')).toHaveTextContent('item 1, quantity:1, price:10, x');
        expect(screen.getByRole('total')).toHaveTextContent('Total: 10');
    });

    it('should report simple events (checkout)', async () => {
        let mock = vi.fn();
        let { rerender } = await mkElement({ ...DEFAULT_PROPS, log: mock });

        fireEvent.click(screen.getByRole('checkout'));
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith('cart event: checkout');
    });

    it('should report forEach item events (remove)', async () => {
        let mock = vi.fn();
        let { rerender } = await mkElement({ ...DEFAULT_PROPS, log: mock });

        fireEvent.click(screen.getByRole('removeItem-b'));
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith('removed item b');
    });
});
