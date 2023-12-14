import { render } from './app.jay-html';
import { JayPort, setMainPort, HandshakeMessageJayChannel } from 'jay-secure';
import './index.css';

const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');
    let app = render({});
    target.innerHTML = '';
    target.appendChild(app.dom);
};
