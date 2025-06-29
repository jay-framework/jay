import './index.css';
import { HandshakeMessageJayChannel, JayPort, setMainPort } from '@jay-framework/secure';
import { render } from './app.jay-html';

const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');
    let [_, render2] = render({});
    const element = render2({});
    target.appendChild(element.dom);
};
