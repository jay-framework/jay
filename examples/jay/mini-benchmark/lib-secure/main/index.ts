import { render } from './app.jay-html';
import { HandshakeMessageJayChannel, JayPort, setMainPort } from 'jay-secure';
import './index.css';

const jayWorker = new Worker(new URL('../sandbox/immer-workaround', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');
    let [refs, doRender] = render();
    let main = doRender({});
    target.innerHTML = '';
    target.appendChild(main.dom);
};
