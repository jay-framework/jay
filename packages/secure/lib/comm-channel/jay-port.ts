import {IJayEndpoint, IJayPort, JayChannel, JayPortInMessageHandler, JPMMessage} from "./comm-channel";
import {Coordinate} from "jay-runtime";


export interface JayPortLogger {
    logPost(compId: number, message: JPMMessage): void;
    logInvoke(compId: number, message: JPMMessage, endpointFound: boolean): void;
}

export class JayPort implements IJayPort {
    private messages: Array<[number, JPMMessage]> = []
    private endpoints: Map<number, JayEndpoint> = new Map();
    private futureEndpointMessages: Map<number, JPMMessage[]> = new Map();
    private inBatch = false;
    private comps: Map<string, number> = new Map();
    private lastCompId: number = 0;
    private newCompIdMessages: Array<[string, number]> = [];
    private isAutoFlushScheduled: boolean = false;
    private autoFlushTimeout: any = undefined;

    constructor(private channel: JayChannel,
                private logger? : JayPortLogger) {
        channel.onMessages((messages, newCompIdMessages) => this.invoke(messages, newCompIdMessages))
    }

    private getCompId = (parentCompId: number, coordinate: Coordinate): number => {
        let fullId = `${parentCompId}-${coordinate}`;
        if (!this.comps.has(fullId)) {
            let compId = Math.max(this.lastCompId, parentCompId) + 1;
            this.lastCompId = compId;
            this.comps.set(fullId, compId);
            this.newCompIdMessages.push([fullId, compId])
        }
        return this.comps.get(fullId) as number;
    }

    getEndpoint(parentCompId: number, parentCoordinate: Coordinate): IJayEndpoint {
        let compId = this.getCompId(parentCompId, parentCoordinate);
        if (this.endpoints.has(compId))
            return this.endpoints.get(compId);
        let ep = new JayEndpoint(compId, this);
        this.endpoints.set(compId, ep)
        ep.setInitMessages(this.futureEndpointMessages.get(compId) || [])
        this.futureEndpointMessages.delete(compId);
        return ep;
    }

    getRootEndpoint(): IJayEndpoint {
        return this.getEndpoint(-1, [''])
    }

    post(compId: number, outMessage: JPMMessage) {
        if (this.logger)
            this.logger.logPost(compId, outMessage)
        this.messages.push([compId, outMessage]);
        if (!this.inBatch)
            this.scheduleFlush();
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

    invoke(messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) {
        newCompIdMessages.forEach(([fullId, compId]) => {
            this.comps.set(fullId, compId)
            this.lastCompId = Math.max(this.lastCompId, compId)
        });
        this.batch(() => {
            messages.forEach(([compId, message]) => {
                let endpoint = this.endpoints.get(compId);
                if (this.logger)
                    this.logger.logInvoke(compId, message, !!endpoint)
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
        this.channel.postMessages(this.messages, this.newCompIdMessages);
        this.messages = [];
        this.newCompIdMessages = [];
        if (this.isAutoFlushScheduled) {
            this.isAutoFlushScheduled = false;
            clearTimeout(this.autoFlushTimeout);
        }
    }

    private scheduleFlush() {
        this.isAutoFlushScheduled = true;
        this.autoFlushTimeout = setTimeout(() => {
            this.autoFlushTimeout = undefined;
            this.isAutoFlushScheduled = false;
            this.flush();
        })
    }
}

export class JayEndpoint implements IJayEndpoint {

    private handler: JayPortInMessageHandler
    private initMessages: JPMMessage[] = [];
    constructor(
        readonly compId: number,
        public readonly port: JayPort) {}

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
