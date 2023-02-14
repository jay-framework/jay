import {JayPort, JayPortInMessageHandler, JayPortMessage, setPort} from '../../lib/comm-channel'

export function useMockCommunicationChannel<PropsT, ViewState>(): [JayMockChannel<PropsT, ViewState>, JayPort, JayPort] {
    let channel = new JayMockChannel<PropsT, ViewState>();
    return [channel, channel.mainPort, channel.workerPort]
}

class JayMockChannel<PropsT, ViewState> {

    private readonly main: MockJayPort
    private readonly worker: MockJayPort
    private pendingMessages: number = 0;
    private dirty = Promise.resolve();
    private dirtyResolve: () => void

    constructor() {
        this.pendingMessages = 0;
        this.main = new MockJayPort('main', this.messageCountCallback);
        this.worker = new MockJayPort('worker', this.messageCountCallback);
        this.main.setTarget(this.worker);
        this.worker.setTarget(this.main)
    }

    messageCountCallback = (diff) => {
        if (this.pendingMessages === 0)
            [this.dirty, this.dirtyResolve] = mkResolvablePromise();
        this.pendingMessages += diff
        if (this.pendingMessages === 0)
            this.dirtyResolve();
    }

    toBeClean() {
        return this.dirty;
    }

    get mainPort(): JayPort {return this.main}
    get workerPort(): JayPort {return this.worker}
}

class MockJayPort implements JayPort {

    private handler: JayPortInMessageHandler
    private target: MockJayPort
    private messages: Array<[string, JayPortMessage]> = []

    constructor(public readonly name: string, private messageCountCallback: (diff: number) => void) {
    }

    post(compId: string, outMessage: JayPortMessage) {
        this.messages.push([compId, outMessage]);
        this.messageCountCallback(1)
    }

    onUpdate(handler: JayPortInMessageHandler) {
        this.handler = handler
    }

    setTarget(target: MockJayPort) {
        this.target = target;
    }

    invoke(inMessage: JayPortMessage) {
        this?.handler(inMessage);
    }

    batch(handler: () => void) {
        this.messages = [];
        try {
            setPort(this);
            handler()
        }
        finally {
            this.flush();
        }
    }

    flush() {
        process.nextTick(() => {
            this.messages.forEach(([compId, message]) => this.target.invoke(message))
            this.messageCountCallback(-this.messages.length)
        })
    }
}

function mkResolvablePromise() {
    let resolve;
    let promise = new Promise((res) => resolve = res);
    return [promise, resolve];
}
