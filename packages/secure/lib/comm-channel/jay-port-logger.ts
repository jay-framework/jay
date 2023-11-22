import { JPMMessage } from './comm-channel.ts';

export interface JayPortLogger {
    logPost(compId: number, message: JPMMessage): void;
    logInvoke(compId: number, message: JPMMessage, endpointFound: boolean): void;
}

export class JayPortLoggerConsole implements JayPortLogger {
    logPost(compId: number, message: JPMMessage) {
        console.log('[port] post', compId, message);
    }

    logInvoke(compId: number, message: JPMMessage, endpointFound: boolean) {
        console.log('[port] invoke', compId, message);
    }
}
