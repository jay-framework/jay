import { render } from './app.jay-html';
import { HandshakeMessageJayChannel, JayPort, setMainPort } from 'jay-secure';

const jayWorker = new Worker('./immer-workaround.js');

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');
    let main = render({});
    target.innerHTML = '';
    target.appendChild(main.dom);
};
