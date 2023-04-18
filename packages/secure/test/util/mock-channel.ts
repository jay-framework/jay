import {
    JayChannel,
    JayEndpoint,
    JayPort,
    JayPortInMessageHandler,
    JayPortMessageType,
    JPMMessage
} from '../../lib/comm-channel'
import {Coordinate} from "jay-runtime";

export function useMockCommunicationChannel<PropsT, ViewState>(verbose: boolean = false): JayMockChannel<PropsT, ViewState> {
    return new JayMockChannel<PropsT, ViewState>(verbose)
}

class JayMockChannel<PropsT, ViewState> implements JayChannel {

    private readonly main: MockJayPort
    private readonly worker: MockJayPort
    private pendingMessages: number = 0;
    private dirty = Promise.resolve();
    private dirtyResolve: () => void
    private comps: Map<string, number> = new Map();
    private nextCompId: number = 1;

    constructor(private verbose: boolean = false) {
        this.pendingMessages = 0;
        this.main = new MockJayPort(this.messageCountCallback, this.getCompId, verbose, 'main port');
        this.worker = new MockJayPort(this.messageCountCallback, this.getCompId, verbose, 'sandbox port');
        this.main.setTarget(this.worker);
        this.worker.setTarget(this.main)
    }

    getCompId = (parentCompId: number, coordinate: Coordinate): number => {
        let fullId = `${parentCompId}-${coordinate}`;
        if (!this.comps.has(fullId))
            this.comps.set(fullId, this.nextCompId++);
        return this.comps.get(fullId) as number;
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
    private messages: Array<[number, JPMMessage]> = []
    private target: MockJayPort
    private endpoints: Map<number, MockEndpointPort> = new Map();

    constructor(private messageCountCallback: (diff: number) => void, 
                private getCompId:(parentCompId: number, coordinate: Coordinate) => number,
                private verbose: boolean = false,
                private name: string = '') {}
                
    getEndpoint(parentCompId: number, parentCoordinate: Coordinate): JayEndpoint {
        let compId = this.getCompId(parentCompId, parentCoordinate);
        let ep = new MockEndpointPort(compId, this);
        this.endpoints.set(compId, ep)
        return ep;
    }

    getRootEndpoint(): JayEndpoint {
        return this.getEndpoint(-1, [''])
    }

    post(compId: number, outMessage: JPMMessage) {
        if (this.verbose)
            console.log(`${this.name} post - compId: ${compId} type: ${describeMessageType(outMessage.type)} message: ${JSON.stringify(outMessage)}`)
        this.messages.push([compId, outMessage]);
        this.messageCountCallback(1)
    }

    setTarget(target: MockJayPort) {
        this.target = target;
    }

    batch<T>(handler: () => T): T {
        this.messages = [];
        try {
            return handler()
        }
        finally {
            if (this.messages.length > 0)
                this.flush();
        }
    }

    invoke(messages: Array<[number, JPMMessage]>) {
        this.batch(() => {
            messages.forEach(([compId, message]) => {
                if (this.verbose)
                    console.log(`${this.name} invoke - compId: ${compId} type: ${describeMessageType(message.type)} message: ${JSON.stringify(message)}`)
                this.endpoints.get(compId)?.invoke(message)
            })
        })
    }

    flush() {
        process.nextTick(() => {
            this.target.invoke(this.messages);
            this.messageCountCallback(-this.messages.length)
        })
    }
}

class MockEndpointPort implements JayEndpoint {

    private handler: JayPortInMessageHandler
    constructor(
        readonly compId: number,
        private readonly port: MockJayPort) {}

    post(outMessage: JPMMessage) {
        this.port.post(this.compId, outMessage)
    }

    onUpdate(handler: JayPortInMessageHandler) {
        this.handler = handler
    }

    invoke(inMessage: JPMMessage) {
        this?.handler(inMessage);
    }
}

function mkResolvablePromise() {
    let resolve;
    let promise = new Promise((res) => resolve = res);
    return [promise, resolve];
}

function describeMessageType(type: JayPortMessageType): string {
    switch (type) {
        case JayPortMessageType.render:
            return 'render'
        case JayPortMessageType.addEventListener:
            return 'addEventListener'
        case JayPortMessageType.root:
            return 'root'
        case JayPortMessageType.DOMEvent:
            return 'DOMEvent'
        case JayPortMessageType.removeEventListener:
            return 'removeEventListener'
        case JayPortMessageType.nativeExec:
            return 'nativeExec'
        case JayPortMessageType.nativeExecResult:
            return 'nativeExecResult'
    }
    return 'unknown message'
}