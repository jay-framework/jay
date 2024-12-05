// import 'jay-reactive/tracing'
import { AppComponent } from './timer-screen';

window.onload = function () {
    let target = document.body;
    let app = AppComponent({});
    target.innerHTML = '';
    document.body.style.width = '100%';
    document.body.style.aspectRatio = app.element.dom.style.aspectRatio;
    target.appendChild(app.element.dom);
};
