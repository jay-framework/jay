export interface FunctionRepositoryCodeFragment {
    handlerCode: string;
    constCode: string;
}

export class FunctionRepositoryBuilder {
    public readonly fragments: Array<FunctionRepositoryCodeFragment> = [];
    private nextIndex = 0;

    add(handlerCode: string): string {
        const constCode = `${this.nextIndex++}`;
        this.fragments.push({constCode, handlerCode})
        return constCode
    }
}
