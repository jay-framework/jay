import {TreeNode, node} from './tree-node';

let root = node('root', [
    node('node 1'),
    node('node 2', [
        node('node 2.1'),
        node('node 2.2', [
            node('node 2.2.1'),
            node('node 2.2.2')
        ])
    ]),
    node('node 3'),

])

window.onload = function() {
    let target = document.getElementById('target');
    let counter = TreeNode(root);
    target.innerHTML = '';
    target.appendChild(counter.element.dom);
}



