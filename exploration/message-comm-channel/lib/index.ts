import { HandshakeMessageJayChannel } from '@jay-framework/secure';

var myWorker = new Worker('./worker');

setTimeout(() => {
    let channel = new HandshakeMessageJayChannel(myWorker);

    channel.onMessages((messages, newCompIdMessages) => {
        console.log(messages, newCompIdMessages);
    });
}, Math.random() * 1000);
