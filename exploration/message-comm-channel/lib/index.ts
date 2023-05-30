import {HandshakeMessageJayChannel} from "../../../packages/secure/dist/comm-channel/message-channel";

var myWorker = new Worker('./worker.js')

setTimeout(() => {
    let channel = new HandshakeMessageJayChannel(myWorker);

    channel.onMessages((messages, newCompIdMessages) => {
        console.log(messages, newCompIdMessages)
    })
}, Math.random() * 1000)

