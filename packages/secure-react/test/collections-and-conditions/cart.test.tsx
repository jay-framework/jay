import { setChannel, useMockCommunicationChannel } from 'jay-secure/dist/test-utils';
import {act, fireEvent, render, screen} from '@testing-library/react'
import App from './main/App'
import {initializeWorker} from "./worker/worker-root.ts";
import {CartProps} from "./main/cart.tsx";

const VERBOSE = true;

describe('cart testing conditions and collections', () => {

    const DEFAULT_PROPS: CartProps = {
        lineItems: [
            {name: 'item 1', price: 10, quantity: 1, id: 'a'},
            {name: 'item 2', price: 10, quantity: 2, id: 'b'}
        ],
        total: 30,
        minimumOrder: 20
    }

    async function mkElement(cartProps: CartProps = DEFAULT_PROPS) {
        let channel = useMockCommunicationChannel(VERBOSE);
        setChannel(channel);
        initializeWorker();
        render(<App {...cartProps}/>)
        // screen.debug();
        await act(() => {
            return channel.toBeClean();
        });
        return {channel}
    }

    it('render a full cart (a collection ) with enough line items (condition true)', async () => {
        await mkElement();

        screen.debug();
        // fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('condition')).toHaveTextContent('minimum order price reached')
        expect(screen.getByRole('lineItem-a')).toHaveTextContent('item 1, quantity:1, price:10, x')
        expect(screen.getByRole('lineItem-b')).toHaveTextContent('item 2, quantity:2, price:10, x')
    })

    // it('counter with button click - subtract', async () => {
    //     let {channel} = await mkElement();
    //
    //     // screen.debug();
    //     fireEvent.click(screen.getByRole('sub'))
    //     await act(() => {
    //         return channel.toBeClean();
    //     });
    //     expect(screen.getByRole('value')).toHaveTextContent('11')
    // })
    //
    // it('counter with multiple button clicks - subtract, subtract, subtract, adder', async () => {
    //     let {channel} = await mkElement();
    //
    //     // screen.debug();
    //     fireEvent.click(screen.getByRole('sub'))
    //     await act(() => {
    //         return channel.toBeClean();
    //     });
    //
    //     fireEvent.click(screen.getByRole('sub'))
    //     await act(() => {
    //         return channel.toBeClean();
    //     });
    //
    //     fireEvent.click(screen.getByRole('sub'))
    //     await act(() => {
    //         return channel.toBeClean();
    //     });
    //
    //     fireEvent.click(screen.getByRole('add'))
    //     await act(() => {
    //         return channel.toBeClean();
    //     });
    //     expect(screen.getByRole('value')).toHaveTextContent('10')
    // })
})