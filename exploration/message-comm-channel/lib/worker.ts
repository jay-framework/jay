import {JayChannel, JPMMessage} from "../../../packages/secure/dist/comm-channel/comm-channel"

interface WorkerSelf {
    postMessage(message: any): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}

const SYN = 'SYN';
const ACK = 'ACK'

type ChannelMessage = {messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>}

class MessageChannelWorkerSide implements JayChannel {

    private handler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void;
    private worker: WorkerSelf;
    private handshakeComplete = false;
    private pendingMessages: Array<ChannelMessage> = []

    constructor(worker: WorkerSelf) {
        worker.addEventListener('message', ev => {
            console.log('worker', ev)
            if (((ev as MessageEvent).data === SYN || (ev as MessageEvent).data === ACK)) {
                if (!this.handshakeComplete) {
                    console.log('...')
                    if ((ev as MessageEvent).data === SYN)
                        worker.postMessage(ACK)
                    this.handshakeComplete = true;
                    this.pendingMessages.forEach(message => this.worker.postMessage(message))
                    this.pendingMessages = [];
                }
            }
            else {
                let {messages, newCompIdMessages} = (ev as MessageEvent).data;
                if (this.handler)
                    this.handler(messages, newCompIdMessages);
            }
        })
        this.worker = worker;
        this.worker.postMessage(SYN);
    }


    onMessages(handler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void) {
        this.handler = handler;
    }

    postMessages(messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) {
        if (!this.handshakeComplete)
            this.pendingMessages.push({messages, newCompIdMessages})
        else
            this.worker.postMessage({messages, newCompIdMessages});
    }
}

let channel = new MessageChannelWorkerSide(self);

channel.postMessages([[-1, {viewState: {}, type: 0}]], [])


// self.addEventListener('message', e => {
//     self.postMessage('')
// }, false)
