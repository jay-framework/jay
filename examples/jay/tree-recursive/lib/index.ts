import { TreeNode, node } from './tree-node';
import './index.css';

let root = node('root', [
    node('node 1', [node('node 1.1'), node('node 1.2')]),
    node('node 2', [
        node('node 2.1'),
        node('node 2.2', [node('node 2.2.1'), node('node 2.2.2'), node('node 2.2.3')]),
        node('node 2.3'),
    ]),
    node('node 3', [node('node 3.1', [node('node 3.1.1'), node('node 3.1.2')])]),
    node('node 4'),
]);

window.onload = function () {
    let target = document.getElementById('target');
    let treeComponent = TreeNode({ root });
    target.innerHTML = '';
    target.appendChild(treeComponent.element.dom);
};
