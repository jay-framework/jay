export class KindergardenGroup {
    private kindergarden: Kindergarden;

    constructor(kindergarden: Kindergarden) {
        this.kindergarden = kindergarden;
    }

    ensureNode(node: HTMLElement) {
        this.kindergarden.parentNode.appendChild(node)
    }

    removeNode(node: HTMLElement) {
        this.kindergarden.parentNode.removeChild(node)
    }
}


export class Kindergarden {
    protected parentNode: HTMLElement;

    constructor(parentNode: HTMLElement) {
        this.parentNode = parentNode;
    }

    newGroup(): KindergardenGroup {
        return new KindergardenGroup(this)
    }
}