import {render} from './composite.jay.html';

export default {
    render,
    data
}

function data() {
    return function (index) {
        if (index === 0)
            return {text: 'name', text2: 'text 2'}
        else
            return {text: 'name ' + index, text2: 'text 2 ' + index}
    }
}

