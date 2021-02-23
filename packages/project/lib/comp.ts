import {render} from './comp.jay.html';

function data() {
    render({
        s1: 'some string',
        n1: 12,
        b1: false,
        o1: {
            s2: 'sss',
            n2: 23
        },
        a1: []
    });
}