import {MainPort, WorkerPort} from '../../lib/comm-channel'

export function useMochCommunicationChannel<RootComponentProps>(): [MainPort<RootComponentProps>, WorkerPort<RootComponentProps>] {
    let workerPort = new MockWorkerPort();
    let mainPort = new MockMainPort();
    mainPort.workerPort = workerPort;
    return [mainPort, workerPort]
}

class MockMainPort<T> implements MainPort<T> {
    workerPort: WorkerPort<T>
    init(initData: T): object {
        return this.workerPort.onInit(initData);
    }

    update(data: T): object {
        return this.workerPort.onUpdate(data);
    }
}

class MockWorkerPort<T> implements WorkerPort<T> {
    onInit: (initData: T) => object;
    onUpdate: (data: T) => object;

}