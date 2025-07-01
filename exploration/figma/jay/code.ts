// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for the plugins. It has access to the *document*.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (see documentation).

// This shows the HTML page in "ui.html".
// figma.showUI(__html__);

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.

figma.on('run', () => {
    console.log('run called');
    console.log(figma.currentPage);
    console.log(figma.currentPage.selection);
    figma.currentPage.selection.forEach((_) => console.log(printNode(_)));
    figma.closePlugin();
});

function isChildrenMixin(node: any): node is ChildrenMixin {
    return !!node['children'];
}

function isInstanceNode(node: any): node is InstanceNode {
    return node.type === 'INSTANCE';
}

function isComponentNode(node: any): node is ComponentNode {
    return node.type === 'COMPONENT';
}

function isGroupNode(node: any): node is GroupNode {
    return node.type === 'GROUP';
}

function isTextNode(node: any): node is TextNode {
    return node.type === 'TEXT';
}

function getVariant(node: VariantMixin): string {
    return JSON.stringify(node.variantProperties);
}

function printNode(node: SceneNode, ident: string = '') {
    let nodeInfo = '';
    if (isInstanceNode(node)) {
        nodeInfo =
            `${node.mainComponent.type}, ${node.mainComponent.id}, ${getVariant(node)} wh:${
                node.width
            }:${node.height}, xy:${node.x}:${node.y}, cons:${JSON.stringify(node.constraints)}` +
            node.toString();
    }

    if (isComponentNode(node)) {
        nodeInfo =
            `${getVariant(node)} wh:${node.width}:${node.height}, xy:${node.x}:${
                node.y
            }, cons:${JSON.stringify(node.constraints)} ` + node.toString();
    }

    if (isGroupNode(node)) {
        nodeInfo = `wh:${node.width}:${node.height}, xy:${node.x}:${node.y} ` + node.toString();
    }

    if (isTextNode(node)) {
        nodeInfo =
            `wh:${node.width}:${node.height}, xy:${node.x}:${node.y}, ${JSON.stringify(
                node.constraints,
            )} ` + node.toString();
    }
    if (isChildrenMixin(node) && !isInstanceNode(node)) {
        let children = node.children.map((child) => printNode(child, ident + '  ')).join('\n');
        return `${ident}${node.type}, ${node.id}, ${node.name} ${nodeInfo} {\n${children}\n${ident}}`;
    } else return `${ident}${node.type}, ${node.id}, ${node.name} ${nodeInfo}`;
}

figma.ui.onmessage = (msg) => {
    // One way of distinguishing between different types of messages sent from
    // your HTML page is to use an object with a "type" property like this.
    if (msg.type === 'create-rectangles') {
        const nodes: SceneNode[] = [];
        for (let i = 0; i < msg.count; i++) {
            const rect = figma.createRectangle();
            rect.x = i * 150;
            rect.fills = [{ type: 'SOLID', color: { r: 1, g: 0.5, b: 0 } }];
            figma.currentPage.appendChild(rect);
            nodes.push(rect);
        }
        figma.currentPage.selection = nodes;
        figma.viewport.scrollAndZoomIntoView(nodes);
    }

    // Make sure to close the plugin when you're done. Otherwise the plugin will
    // keep running, which shows the cancel button at the bottom of the screen.
    figma.closePlugin();
};
