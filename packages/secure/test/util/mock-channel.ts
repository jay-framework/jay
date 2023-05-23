import {
    JayChannel,
    JayEndpoint,
    JayPort,
    JayPortInMessageHandler,
    JPMMessage
} from '../../lib/comm-channel/comm-channel'
import {Coordinate} from "jay-runtime";
import {JayPortMessageType} from "../../lib/comm-channel/messages";

export function useMockCommunicationChannel<PropsT, ViewState>(verbose: boolean = false): JayMockChannel<PropsT, ViewState> {
    return new JayMockChannel<PropsT, ViewState>(verbose)
}

type MessageStatus = 'posted' | 'invoked';

class JayMockChannel<PropsT, ViewState> implements JayChannel {

    private readonly main: MockJayPort
    private readonly worker: MockJayPort
    private pendingMessages: number = 0;
    private dirty = Promise.resolve();
    private dirtyResolve: () => void
    private comps: Map<string, number> = new Map();
    private nextCompId: number = 1;
    public readonly messageLog: Array<[JPMMessage, MessageStatus]> = [];

    constructor(private verbose: boolean = false) {
        this.pendingMessages = 0;
        this.main = new MockJayPort(this, verbose, 'MAIN');
        this.worker = new MockJayPort(this, verbose, 'SANDBOX');
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
    private futureEndpointMessages: Map<number, JPMMessage[]> = new Map();
    private inBatch = false;

    constructor(private channel,
                private verbose: boolean = false,
                private name: string = '') {}
                
    getEndpoint(parentCompId: number, parentCoordinate: Coordinate): JayEndpoint {
        let compId = this.channel.getCompId(parentCompId, parentCoordinate);
        let ep = new MockEndpointPort(compId, this);
        this.endpoints.set(compId, ep)
        ep.setInitMessages(this.futureEndpointMessages.get(compId) || [])
        this.futureEndpointMessages.delete(compId);
        return ep;
    }

    getRootEndpoint(): JayEndpoint {
        return this.getEndpoint(-1, [''])
    }

    post(compId: number, outMessage: JPMMessage) {
        if (this.verbose)
            console.log(`${this.name}.post - compId: ${compId} type: ${describeMessageType(outMessage.type)} message: ${JSON.stringify(outMessage)}`)
        this.channel.messageLog.push([outMessage, 'posted']);
        this.messages.push([compId, outMessage]);
        this.channel.messageCountCallback(1)
    }

    setTarget(target: MockJayPort) {
        this.target = target;
    }

    batch<T>(handler: () => T): T {
        if (this.inBatch)
            return handler();
        this.inBatch = true;
        this.messages = [];
        try {
            return handler()
        }
        finally {
            if (this.messages.length > 0)
                this.flush();
            this.inBatch = false;
        }
    }

    invoke(messages: Array<[number, JPMMessage]>) {
        this.batch(() => {
            messages.forEach(([compId, message]) => {
                if (this.verbose)
                    console.log(`${this.name}.invoke - compId: ${compId} ${this.endpoints.get(compId)?"":"[COMP NOT FOUND] "}type: ${describeMessageType(message.type)} message: ${JSON.stringify(message)}`)
                this.channel.messageLog
                    .find(item => item[0] === message)[1] = 'invoked'
                let endpoint = this.endpoints.get(compId);
                if (endpoint)
                    endpoint.invoke(message)
                else {
                    if (!this.futureEndpointMessages.has(compId))
                        this.futureEndpointMessages.set(compId, [message])
                    else
                        this.futureEndpointMessages.get(compId).push(message);
                }

            })
        })
    }

    flush() {
        let messages = this.messages;
        process.nextTick(() => {
            this.target.invoke(messages);
            this.channel.messageCountCallback(-messages.length)
        })
    }
}

class MockEndpointPort implements JayEndpoint {

    private handler: JayPortInMessageHandler
    private initMessages: JPMMessage[] = [];
    constructor(
        readonly compId: number,
        public readonly port: MockJayPort) {}

    post(outMessage: JPMMessage) {
        this.port.post(this.compId, outMessage)
    }

    onUpdate(handler: JayPortInMessageHandler) {
        this.handler = handler
        this.initMessages.forEach(message => handler(message))
        this.initMessages = [];
    }

    invoke(inMessage: JPMMessage) {
        this?.handler(inMessage);
    }

    setInitMessages(initMessages: JPMMessage[]) {
        this.initMessages = initMessages;
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
        case JayPortMessageType.rootApiReturns:
            return 'rootAPIReturns'
        case JayPortMessageType.rootApiInvoke:
            return 'rootAPIInvoke'
    }
    return 'unknown message'
}