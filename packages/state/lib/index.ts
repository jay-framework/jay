
export type Getter<T> = () => T

export type Prop<PropsT> = {
    [K in keyof PropsT]: Getter<PropsT[K]>
}
