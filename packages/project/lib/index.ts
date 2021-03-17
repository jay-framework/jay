import {render} from './comp.jay.html';

let initialData = {
    s1: 'udi',
    n1: 12,
    b1: false,
    o1: {
        s2: 'sss',
        n2: 23
    },
    a1: [{s3: 'abc', n3: 123}, {s3: 'def', n3: 456}]
}

window.onload = function() {
    let target = document.getElementById('target');

    let {dom, update} = render(initialData);
    target.innerHTML = '';
    target.appendChild(dom);

    let count = 12;
    let interval = setInterval(() => {
        initialData.n1 = count++;
        initialData.b1 = count % 2 === 0;
        initialData.a1.push({s3: "id" + count, n3: count})
        update(initialData);
        if (count == 30)
            clearInterval(interval)
    }, 500)
}
