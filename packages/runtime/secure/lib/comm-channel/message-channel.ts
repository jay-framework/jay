import { JayChannel, JPMMessage } from './comm-channel';

const SYN = 'SYN';
const ACK = 'ACK';

type ChannelMessage = {
    messages: Array<[number, JPMMessage]>;
    newCompIdMessages: Array<[string, number]>;
};
interface WorkerSelf {
    postMessage(message: any): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
}

export class HandshakeMessageJayChannel implements JayChannel {
    private handler: (
        messages: Array<[number, JPMMessage]>,
        newCompIdMessages: Array<[string, number]>,
    ) => void;
    private worker: Worker | WorkerSelf;
    private handshakeComplete = false;
    private pendingMessages: Array<ChannelMessage> = [];

    constructor(worker: Worker | WorkerSelf) {
        worker.addEventListener('message', this.workerOnMessage);
        this.worker = worker;
        this.worker.postMessage(SYN);
    }

    workerOnMessage = (ev: MessageEvent) => {
        if (ev.data === SYN || ev.data === ACK) {
            if (!this.handshakeComplete) {
                if ((ev as MessageEvent).data === SYN) this.worker.postMessage(ACK);
                this.handshakeComplete = true;
                this.pendingMessages.forEach((message) => this.worker.postMessage(message));
                this.pendingMessages = [];
            }
        } else {
            let { messages, newCompIdMessages } = ev.data;
            if (this.handler) this.handler(messages, newCompIdMessages);
        }
    };

    onMessages(
        handler: (
            messages: Array<[number, JPMMessage]>,
            newCompIdMessages: Array<[string, number]>,
        ) => void,
    ) {
        this.handler = handler;
    }

    postMessages(
        messages: Array<[number, JPMMessage]>,
        newCompIdMessages: Array<[string, number]>,
    ) {
        if (!this.handshakeComplete) this.pendingMessages.push({ messages, newCompIdMessages });
        else this.worker.postMessage({ messages, newCompIdMessages });
    }
}
