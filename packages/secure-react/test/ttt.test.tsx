import { setChannel, useMockCommunicationChannel } from 'jay-secure/dist/test-utils';
import { render, screen } from '@testing-library/react'
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


    it('renders the App component', () => {
        mkElement();

        screen.debug(); // prints out the jsx in the App component unto the command line
    })
})