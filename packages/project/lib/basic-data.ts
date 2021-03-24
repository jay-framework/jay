import {render} from './basic.jay.html';

export default {
    render,
    data
}

function data() {
    return function (index) {
        if (index === 0)
            return {text: 'name'};
        else
            return {text: 'name ' + index};
    }
}
