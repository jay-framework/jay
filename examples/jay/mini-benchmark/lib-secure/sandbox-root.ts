import './app.jay-html';
import {
    HandshakeMessageJayChannel,
    JayPort,
    setWorkerPort,
} from 'jay-secure';

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
