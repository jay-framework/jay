export interface FunctionRepositoryCodeFragment {
    handlerCode: string;
    constCode: string;
}

export class FunctionRepositoryBuilder {
    public readonly fragments: Array<FunctionRepositoryCodeFragment> = [];
    private nextIndex = 0;

    add(handlerCode: string, index?: number): string {
        if (!index) {
            index = this.nextIndex++
        }
        else
            this.nextIndex = index + 1;
        const constCode = `${index}`;
        this.fragments.push({constCode, handlerCode})
        return constCode
    }

}
