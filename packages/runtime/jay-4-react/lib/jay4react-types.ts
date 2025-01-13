type PropsFromReact<T extends (...args: any[]) => any> = Parameters<T>[0];
type FunctionProperties<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
};
type OnlyFunctionProperties2<A> = {
    [K in keyof A as A[K] extends never ? never : K]: A[K];
};
export type ReactToCompRef<T extends (...args: any[]) => any> = OnlyFunctionProperties2<
    FunctionProperties<PropsFromReact<T>>
>;
