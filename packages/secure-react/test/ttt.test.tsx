import { setChannel, useMockCommunicationChannel } from 'jay-secure/dist/test-utils';
import {act, fireEvent, render, screen} from '@testing-library/react'
import App from './App'
import {initializeWorker} from "./fixtures/counter/worker/worker-root.ts";

const VERBOSE = false;

describe('App', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel(VERBOSE);
        setChannel(channel);
        initializeWorker();
        render(<App />)
    }

    it('renders the App component', async () => {
        mkElement();

        fireEvent.click(screen.getByRole('sub'))
        expect(screen.getByRole('value')).toHaveTextContent('11')
    })
})