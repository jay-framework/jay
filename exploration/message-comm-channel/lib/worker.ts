import { HandshakeMessageJayChannel } from 'jay-secure';

setTimeout(() => {
    let channel = new HandshakeMessageJayChannel(self);

    channel.postMessages([[-1, { patch: [], type: 0 }]], []);
}, Math.random() * 1000);
