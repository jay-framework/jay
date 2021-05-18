import {KindergardenGroupListener, KindergartenGroup} from "./kindergarden";

export interface NodeReference {
    forEach(handler: (node: Node) => void)
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void;
}

export class SingleReference implements NodeReference {
    private readonly node: Node;

    constructor(node: Node) {
        this.node = node;
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
        this.node.addEventListener(type, listener, options);
    }

    forEach(handler: (node: Node) => void) {
        handler(this.node)
    }

    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
        this.node.removeEventListener(type, callback, options)
    }
    
}

export class KindergartenGroupReference implements NodeReference, KindergardenGroupListener {
    private readonly group: KindergartenGroup;
    private listeners = [];

    constructor(group: KindergartenGroup) {
        this.group = group;
        group.addListener(this);
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
        this.listeners.push({type, listener, options})
        this.group.children.forEach(child =>
            child.addEventListener(type, listener, options))
    }

    addNode(node: Node) {
        this.listeners.forEach(listener =>
            node.addEventListener(listener.type, listener.listener, listener.options))
    }

    forEach(handler: (node: Node) => void) {
        this.group.children.forEach(node => handler(node));
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
        this.listeners = this.listeners.filter(item => item.type !== type || item.listener !== listener);
        this.group.children.forEach(child =>
            child.removeEventListener(type, listener, options))
    }

    removeNode(node: Node) {
        this.listeners.forEach(listener =>
            node.removeEventListener(listener.type, listener.listener, listener.options))
    }
}