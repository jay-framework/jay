import Node from "node-html-parser/dist/nodes/node";
import {HTMLElement, NodeType} from "node-html-parser";
import {WithValidations} from "jay-compiler-shared";

export function isConditional(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('if');
}

export function isForEach(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('forEach');
}

export function ensureSingleChildElement(node: Node): WithValidations<HTMLElement> {
    const elements = node.childNodes.filter((child) => child.nodeType === NodeType.ELEMENT_NODE);
    if (elements.length === 1) {
        return new WithValidations(elements[0] as HTMLElement)
    }
    else return new WithValidations(undefined, [`Jay HTML Body must have a single child element, yet ${elements.length} found.`])
}