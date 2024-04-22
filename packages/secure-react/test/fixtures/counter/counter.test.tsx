import { setChannel, useMockCommunicationChannel } from 'jay-secure/dist/test-utils';
import {act, fireEvent, render, screen} from '@testing-library/react'
import App from './main/App'
import {initializeWorker} from "./worker/worker-root.ts";

const VERBOSE = true;

describe('Simple react component', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel(VERBOSE);
        setChannel(channel);
        initializeWorker();
        render(<App />)
        // screen.debug();
        await act(() => {
            return channel.toBeClean();
        });
        return {channel}
    }

    it('render a counter', async () => {
        await mkElement();

        // screen.debug();
        // fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('value')).toHaveTextContent('12')
    })

    it('counter with button click - subtract', async () => {
        let {channel} = await mkElement();

        // screen.debug();
        fireEvent.click(screen.getByRole('sub'))
        await act(() => {
            return channel.toBeClean();
        });
        expect(screen.getByRole('value')).toHaveTextContent('11')
    })

    it('counter with multiple button clicks - subtract, subtract, subtract, adder', async () => {
        let {channel} = await mkElement();

        // screen.debug();
        fireEvent.click(screen.getByRole('sub'))
        await act(() => {
            return channel.toBeClean();
        });

        fireEvent.click(screen.getByRole('sub'))
        await act(() => {
            return channel.toBeClean();
        });

        fireEvent.click(screen.getByRole('sub'))
        await act(() => {
            return channel.toBeClean();
        });

        fireEvent.click(screen.getByRole('add'))
        await act(() => {
            return channel.toBeClean();
        });
        expect(screen.getByRole('value')).toHaveTextContent('10')
    })
})