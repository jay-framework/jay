


export interface MainPort<RootComponentProps> {
    init(initData: RootComponentProps): object
    update(data: RootComponentProps): object
}

export interface WorkerPort<RootComponentProps> {
    onInit: (initData: RootComponentProps) => object
    onUpdate: (data: RootComponentProps) => object
}