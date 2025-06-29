import './app.jay-html';
import { HandshakeMessageJayChannel, JayPort, setWorkerPort } from '@jay-framework/secure';

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
