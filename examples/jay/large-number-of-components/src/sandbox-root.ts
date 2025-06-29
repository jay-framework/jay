import './app.jay-html';
import {
    HandshakeMessageJayChannel,
    JayPort,
    setMainPort,
    setWorkerPort,
} from '@jay-framework/secure';

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(this)));
