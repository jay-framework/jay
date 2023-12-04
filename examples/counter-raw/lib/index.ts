import run from './counter.comp';
import './index.css';

window.onload = function () {
    let target = document.getElementById('target');
    run(target);
};
