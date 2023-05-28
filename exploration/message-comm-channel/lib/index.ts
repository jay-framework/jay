import {JayChannel, JPMMessage} from "../../../packages/secure/dist/comm-channel/comm-channel"

var myWorker = new Worker('./worker.js')

const SYN = 'SYN';
const ACK = 'ACK'

type ChannelMessage = {messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>}

class MessageChannelMainSide implements JayChannel {

    private handler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void;
    private worker: Worker;
    private handshakeComplete = false;
    private pendingMessages: Array<ChannelMessage> = []

    constructor(worker: Worker) {
        worker.onmessage = (ev => {
            console.log('main', ev)
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
                let {messages, newCompIdMessages} = ev.data;
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

let channel = new MessageChannelMainSide(myWorker);

channel.onMessages((messages, newCompIdMessages) => {
    console.log(messages, newCompIdMessages)
})
