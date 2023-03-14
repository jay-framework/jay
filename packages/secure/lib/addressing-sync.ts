

export type NewMappingEvent = (parentCompId: number, parentCoordinate: string, compId: number) => void
export class AddressingSync {
    private _map = new Map<string, number>();
    private currentCompId = 0;
    constructor(private increment: number, private onNewMapping: NewMappingEvent) {}

    map(parentCompId: number, parentCoordinate: string): number {
        let key = parentCompId + '/' + parentCoordinate;
        if (!this._map.has(key)) {
            let compId = this.currentCompId += this.increment;
            this._map.set(key, compId)
            this.onNewMapping(parentCompId, parentCoordinate, compId)
        }
        return this._map.get(key);
    }

    addMapping(parentCompId: number, parentCoordinate: string, compId: number) {
        let key = parentCompId + '/' + parentCoordinate;
        this._map.set(key, compId)
    }
}