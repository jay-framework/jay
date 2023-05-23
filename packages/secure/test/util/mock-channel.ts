import {
    IJayPort,
    JPMMessage, setMainPort, setWorkerPort
} from '../../lib/comm-channel/comm-channel'
import {JayPortMessageType} from "../../lib/comm-channel/messages";
import {JayPort, JayPortLogger} from "../../lib/comm-channel/jay-port";

export function useMockCommunicationChannel<PropsT, ViewState>(verbose: boolean = false): JayMockChannel2<PropsT, ViewState> {
    return new JayMockChannel2<PropsT, ViewState>(verbose)
}

type MessageStatus = 'posted' | 'invoked';

export interface MockJayChannel {
    mainPort: IJayPort,
    workerPort: IJayPort
}

let _channel: MockJayChannel
export function setChannel(channel: MockJayChannel) {
    _channel = channel;
    setMainPort(channel.mainPort);
    setWorkerPort(channel.workerPort);
}

class JayMockLogger implements JayPortLogger {
    constructor(private name: string, private verbose: boolean) {}

    logInvoke(compId: number, message: JPMMessage, endpointFound: boolean): void {
        if (this.verbose)
            console.log(`${this.name}.invoke - compId: ${compId} ${endpointFound?"":"[COMP NOT FOUND] "}type: ${describeMessageType(message.type)} message: ${JSON.stringify(message)}`)
    }

    logPost(compId: number, message: JPMMessage): void {
        if (this.verbose)
            console.log(`${this.name}.post - compId: ${compId} type: ${describeMessageType(message.type)} message: ${JSON.stringify(message)}`)
    }
}

class JayMockChannel2<PropsT, ViewState> implements MockJayChannel {
    readonly mainPort: IJayPort
    readonly workerPort: IJayPort
    private dirty = Promise.resolve();
    private dirtyResolve: () => void
    private pendingMessages: number = 0;
    private mainOnMessageHandler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void;
    private workerOnMessageHandler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void;
    public readonly messageLog: Array<[JPMMessage, MessageStatus]> = [];

    constructor(private verbose: boolean = false) {
        this.mainPort = new JayPort({
            postMessages: (...args) => this.mainPostingMessages(...args),
            onMessages: (...args) => this.sendMessagesToMain(...args)
        }, new JayMockLogger('MAIN', verbose))

        this.workerPort = new JayPort({
            postMessages: (...args) => this.workerPostingMessages(...args),
            onMessages: (...args) => this.sendMessagesToWorker(...args)
        }, new JayMockLogger('WORKER', verbose))
    }

    mainPostingMessages(messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) {
        this.messageCountCallback(1)
        messages.forEach(([compId, message]) => this.messageLog.push([message, 'posted']));
        process.nextTick(() => {
            this.workerOnMessageHandler(messages, newCompIdMessages);
            messages.forEach(([compId, message]) =>
                this.messageLog
                    .find(item => item[0] === message)[1] = 'invoked'
            );
            this.messageCountCallback(-1)
        })
    }

    sendMessagesToMain(handler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void) {
        this.mainOnMessageHandler = handler;
    }

    workerPostingMessages(messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) {
        this.messageCountCallback(1)
        messages.forEach(([compId, message]) => this.messageLog.push([message, 'posted']));
        process.nextTick(() => {
            this.mainOnMessageHandler(messages, newCompIdMessages);
            messages.forEach(([compId, message]) =>
                this.messageLog
                    .find(item => item[0] === message)[1] = 'invoked'
            );
            this.messageCountCallback(-1)
        })
    }

    sendMessagesToWorker(handler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void) {
        this.workerOnMessageHandler = handler;
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
        case JayPortMessageType.eventInvocation:
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