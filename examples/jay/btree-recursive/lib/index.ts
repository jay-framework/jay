import { BtreeNode, btreeNode } from './btree-node';
import './index.css';

// Create a sample binary tree
//          50
//        /    \
//      30      70
//     /  \    /  \
//   20   40  60  80
//   /         \
//  10         65

let root = btreeNode(
    50,
    btreeNode(30, btreeNode(20, btreeNode(10), null), btreeNode(40)),
    btreeNode(70, btreeNode(60, null, btreeNode(65)), btreeNode(80)),
);

window.onload = function () {
    let target = document.getElementById('target');
    let treeComponent = BtreeNode(root);
    target.innerHTML = '';
    target.appendChild(treeComponent.element.dom);
};
