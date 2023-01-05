import {JayPort, JayPortInMessageHandler, setPort} from '../../lib/comm-channel'

export function useMochCommunicationChannel<PropsT, ViewState>(): [JayPort, JayPort] {
    let channel = new Channel<PropsT, ViewState>();
    return [channel.mainPort, channel.workerPort]
}

class Channel<PropsT, ViewState> {

    private readonly main: MockJayPort
    private readonly worker: MockJayPort

    constructor() {
        this.main = new MockJayPort('main');
        this.worker = new MockJayPort('worker');
        this.main.setTarget(this.worker);
        this.worker.setTarget(this.main)
    }

    get mainPort(): JayPort {return this.main}
    get workerPort(): JayPort {return this.worker}
}

class MockJayPort implements JayPort {

    private handler: JayPortInMessageHandler
    private target: MockJayPort
    private message: Record<string, any> = {}

    constructor(public readonly name: string) {
    }

    post(compId: string, outMessage: any) {
        this.message[compId] = outMessage
    }

    onUpdate(handler: JayPortInMessageHandler) {
        this.handler = handler
    }

    setTarget(target: MockJayPort) {
        this.target = target;
    }

    invoke(inMessage: any) {
        this?.handler(inMessage);
    }

    batch(handler: () => void) {
        this.message = {};
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
            this.target.invoke(this.message)
        })
    }
}

