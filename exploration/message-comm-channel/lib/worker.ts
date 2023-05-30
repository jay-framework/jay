import {HandshakeMessageJayChannel} from "../../../packages/secure/dist/comm-channel/message-channel";

setTimeout(() => {
    let channel = new HandshakeMessageJayChannel(self);

    channel.postMessages([[-1, {viewState: {}, type: 0}]], [])
}, Math.random() * 1000)
