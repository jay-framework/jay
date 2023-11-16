import { HandshakeMessageJayChannel } from 'jay-secure';

var myWorker = new Worker('./worker.js');

setTimeout(() => {
    let channel = new HandshakeMessageJayChannel(myWorker);

    channel.onMessages((messages, newCompIdMessages) => {
        console.log(messages, newCompIdMessages);
    });
}, Math.random() * 1000);
