export type AsyncFunction<F extends (...args: any) => any> =
    ReturnType<F> extends Promise<any>?
        (...args: Parameters<F>) => ReturnType<F>:
        (...args: Parameters<F>) => Promise<ReturnType<F>>
