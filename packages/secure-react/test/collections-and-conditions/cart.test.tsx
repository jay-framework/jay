import { setChannel, useMockCommunicationChannel } from 'jay-secure/dist/test-utils';
import {act, fireEvent, render, screen} from '@testing-library/react'
import App from './main/App'
import {initializeWorker} from "./worker/worker-root.ts";
import {CartProps} from "./main/cart.tsx";

const VERBOSE = true;

const ITEM_A_1 = {name: 'item 1', price: 10, quantity: 1, id: 'a'};
const ITEM_A_2 = {name: 'item 1', price: 15, quantity: 3, id: 'a'};
const ITEM_B_1 = {name: 'item 2', price: 10, quantity: 2, id: 'b'};
const ITEM_C_1 = {name: 'item 3', price: 40, quantity: 7, id: 'c'};
const DEFAULT_PROPS: CartProps = {
    lineItems: [
        ITEM_A_1,
        ITEM_B_1
    ],
    total: 30,
    minimumOrder: 20
}

describe('cart testing conditions and collections', () => {


    async function mkElement(cartProps: CartProps = DEFAULT_PROPS) {
        let channel = useMockCommunicationChannel(VERBOSE);
        setChannel(channel);
        initializeWorker();
        const {rerender} = render(<App {...cartProps}/>)
        // screen.debug();
        await act(() => {
            return channel.toBeClean();
        });
        return {channel, rerender}
    }

    it('render a full cart (a collection ) with enough line items (condition true)', async () => {
        await mkElement();

        screen.debug();
        expect(screen.getByRole('condition')).toHaveTextContent('minimum order price reached')
        expect(screen.getByRole('lineItem-a')).toHaveTextContent('item 1, quantity:1, price:10, x')
        expect(screen.getByRole('lineItem-b')).toHaveTextContent('item 2, quantity:2, price:10, x')
    })

    it('update a collection by updating input props', async () => {
        let {channel, rerender} = await mkElement();

        rerender(<App total={345} minimumOrder={20} lineItems={[ITEM_A_2, ITEM_B_1, ITEM_C_1]}/>)
        await act(() => {
            return channel.toBeClean();
        });
        screen.debug();
        // fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('condition')).toHaveTextContent('minimum order price reached')
        expect(screen.getByRole('lineItem-a')).toHaveTextContent('item 1, quantity:3, price:15, x')
        expect(screen.getByRole('lineItem-b')).toHaveTextContent('item 2, quantity:2, price:10, x')
        expect(screen.getByRole('lineItem-c')).toHaveTextContent('item 3, quantity:7, price:40, x')
    })

})