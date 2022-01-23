export class ContextStack<ContextType> {
    private readonly contexts: Array<ContextType> = [];

    doWithContext<T>(context: ContextType, fn: () => T) {
        try {
            this.contexts.push(context);
            return fn();
        }
        finally {
            this.contexts.pop();
        }
    }

    current(): ContextType {
        return this.contexts[this.contexts.length-1];
    }
}