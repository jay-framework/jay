const RES_SIZE = 256
const decoder = new TextDecoder('utf8')
const encoder = new TextEncoder('utf8')

var ctrlBuffer
var valueBuffer
var decodeBuffer = new Uint8Array(RES_SIZE) // TextDecoder cant use SharedArrayBuffers
const encodeBuffer = new Uint8Array(RES_SIZE) // TextEncoder cant use SharedArrayBuffers

console.log('worker starting!!!')

self.addEventListener('message', e => {
    // console.debug('worker started')
    const {action} = e.data
    if (action === 'init') {
        console.log('worker init')
        const {sharedCtrlBuffer, sharedValueBuffer} = e.data
        ctrlBuffer = new Int32Array(sharedCtrlBuffer)
        valueBuffer = new Int32Array(sharedValueBuffer)
    }
    else if (action === 'start')
        main()
}, false)

function ctrlSignal (value) {
    // console.log('worker - signal', value)
    Atomics.store(ctrlBuffer, 3, value)
    Atomics.store(ctrlBuffer, 2, 1)
    Atomics.notify(ctrlBuffer, 2)
}

function writeMessage(res) {
    // console.log('worker - writing message', res)
    var resJson = JSON.stringify(res)
    encoder.encodeInto(resJson, encodeBuffer)
    // valueBuffer.set(encoder, 0)
    for (let i = 0; i < resJson.length; i++) {
        Atomics.store(valueBuffer, i, encodeBuffer[i])
    }
    return resJson.length;
}

function ctrlWait () {
    Atomics.store(ctrlBuffer, 0, 0)
    Atomics.wait(ctrlBuffer, 0, 0)
    // console.log('worker - wait', ctrlBuffer[0], ctrlBuffer[1])
    return ctrlBuffer[1]
}

function readMessage(resSize) {
    // console.log('worker - read')
    // var resSize = ctrlWait()

    for (let i = 0; i < resSize; i++) {
        decodeBuffer[i] = Atomics.load(valueBuffer, i)
    }
    var res = decoder.decode(decodeBuffer.slice(0, resSize))
    // console.log('worker - read', res)
    return JSON.parse(res)
}

function notifyAndWait(writtenBytes) {
    // reset the bit to wait on
    Atomics.store(ctrlBuffer, 0, 0)
    // write number of bytes written
    Atomics.store(ctrlBuffer, 1, writtenBytes)
    // notify on next message index
    Atomics.notify(ctrlBuffer, 1)
    // wait on the wait biy
    Atomics.wait(ctrlBuffer, 0, 0)
    // return number of bytes to read
    return ctrlBuffer[0]
}

function main () {
    console.log('worker main starting')

    for (let i = 0; i < 1000; i++) {
        let writtenBytes = writeMessage({id: i, payload: 'hello'});
        let bytesToRead = notifyAndWait(writtenBytes);
        let res = readMessage(bytesToRead);
        // console.log('worker received', res);
    }
    console.log('end')
}