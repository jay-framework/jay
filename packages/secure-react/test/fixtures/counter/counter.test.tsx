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
    }

    it('renders the App component', async () => {
        await mkElement();

        // screen.debug();
        // fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('value')).toHaveTextContent('12')
    })
})