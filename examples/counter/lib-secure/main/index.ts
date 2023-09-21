import { render } from './app.jay.html';
import { JayPort, setMainPort } from 'jay-secure';
import { HandshakeMessageJayChannel } from 'jay-secure';

const jayWorker = new Worker('./worker.js');

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');
    let app = render({});
    target.innerHTML = '';
    target.appendChild(app.dom);
};
