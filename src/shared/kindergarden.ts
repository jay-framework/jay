export class KindergartenGroup {
    private kindergarten: Kindergarten;
    children: Set<HTMLElement>;

    constructor(kindergarten: Kindergarten) {
        this.kindergarten = kindergarten;
        this.children = new Set();
    }

    ensureNode(node: HTMLElement) {
        let offset = this.kindergarten.getOffsetFor(this);
        if (this.kindergarten.parentNode.childNodes.length > offset)
            this.kindergarten.parentNode.insertBefore(node, this.kindergarten.parentNode.childNodes[offset]);
        else
            this.kindergarten.parentNode.appendChild(node);
        this.children.add(node);
    }

    removeNode(node: HTMLElement) {
        // if (!this.children.has(node))
        //     throw new Error('cannot remove a node that was not added by this group')
        this.kindergarten.parentNode.removeChild(node);
        this.children.delete(node);
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