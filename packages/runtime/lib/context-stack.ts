export class ContextStack<ContextType> {
    private readonly contexts: Array<ContextType> = [];

    doWithContext<T>(context: ContextType, fn: () => T) {
        let res: T;
        try {
            this.contexts.push(context);
            res = fn();
        }
        finally {
            this.contexts.pop();
        }
        return res;
    }

    current(): ContextType {
        return this.contexts[this.contexts.length-1];
    }
}