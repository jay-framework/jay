import './app.jay-html';
import { HandshakeMessageJayChannel, JayPort, setMainPort, setWorkerPort } from 'jay-secure';

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(this)));
