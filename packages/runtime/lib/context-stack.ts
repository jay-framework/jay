export class ContextStack<ContextType> {
    private readonly contexts: Array<ContextType> = [];

    doWithContext<T>(context: ContextType, fn: () => T): T {
        try {
            this.contexts.push(context);
            return fn();
        } finally {
            this.contexts.pop();
        }
    }

    current(): ContextType {
        return this.contexts[this.contexts.length - 1];
    }

    parent(): ContextType {
        return this.contexts.length > 1 ? this.contexts[this.contexts.length - 2] : undefined;
    }
}
