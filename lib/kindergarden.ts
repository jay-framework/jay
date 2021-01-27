export class KindergartenGroup {
    private kindergarten: Kindergarten;
    children: Set<Node>;

    constructor(kindergarten: Kindergarten) {
        this.kindergarten = kindergarten;
        this.children = new Set();
    }

    ensureNode(node: Node, atIndex?: number) {
        atIndex = atIndex || 0;
        atIndex = atIndex < 0? this.children.size + 1 + atIndex: atIndex;
        let offset = this.kindergarten.getOffsetFor(this);
        if (this.kindergarten.parentNode.childNodes.length> offset + atIndex)
            this.kindergarten.parentNode.insertBefore(node, this.kindergarten.parentNode.childNodes[offset + atIndex]);
        else {
            this.kindergarten.parentNode.appendChild(node);
        }
        this.children.add(node);
    }

    removeNode(node: Node) {
        if (this.children.has(node)) {
            this.kindergarten.parentNode.removeChild(node);
            this.children.delete(node);
        }
    }

    removeNodeAt(pos: number) {
        let offset = this.kindergarten.getOffsetFor(this);
        this.removeNode(this.kindergarten.parentNode.childNodes[offset+pos]);
    }

    moveNode(from: number, to: number) {
        let offset = this.kindergarten.getOffsetFor(this);
        let nodeToMove = this.kindergarten.parentNode.childNodes[offset+from];
        if (to > from)
            to += 1;
        if (this.kindergarten.parentNode.childNodes.length> offset + to)
            this.kindergarten.parentNode.insertBefore(nodeToMove, this.kindergarten.parentNode.childNodes[offset + to]);
        else {
            this.kindergarten.parentNode.appendChild(nodeToMove);
        }
    }
}


export class Kindergarten {
    parentNode: HTMLElement;
    private groups: Array<KindergartenGroup> = [];

    constructor(parentNode: HTMLElement) {
        this.parentNode = parentNode;
    }

    newGroup(): KindergartenGroup {
        let kindergartenGroup = new KindergartenGroup(this);
        this.groups.push(kindergartenGroup);
        return kindergartenGroup
    }

    getOffsetFor(group: KindergartenGroup): number {
        let index = 0;
        let offset = 0;
        while (index < this.groups.length && this.groups[index] !== group) {
            offset = this.groups[index].children.size;
            index = index + 1;
        }
        return offset;
    }
}