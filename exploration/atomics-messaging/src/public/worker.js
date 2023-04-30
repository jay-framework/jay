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

function writeMessage(res) {
    // console.log('worker - writing message', res)
    var resJson = JSON.stringify(res)
    encoder.encodeInto(resJson, encodeBuffer)
    for (let i = 0; i < resJson.length; i++) {
        Atomics.store(valueBuffer, i, encodeBuffer[i])
    }
    return resJson.length;
}

function readMessage(resSize) {
    // console.log('worker - read')
    for (let i = 0; i < resSize; i++) {
        decodeBuffer[i] = Atomics.load(valueBuffer, i)
    }
    var res = decoder.decode(decodeBuffer.slice(0, resSize))
    // console.log('worker - read', res)
    return JSON.parse(res)
}

function notifyAndWait(writtenBytes) {
    // write number of bytes written
    Atomics.store(ctrlBuffer, 1, writtenBytes)
    // notify on next message index
    Atomics.notify(ctrlBuffer, 1)
    // wait on the wait biy
    Atomics.wait(ctrlBuffer, 0, 0)
    // return number of bytes to read
    return Atomics.exchange(ctrlBuffer, 0, 0)
}

function main () {
    console.log('worker main starting')

    let sumLocal = 0, sumRemote = 0;
    for (let i = 0; i < 1000; i++) {
        let writtenBytes = writeMessage({id: i, payload: i});
        let bytesToRead = notifyAndWait(writtenBytes);
        let res = readMessage(bytesToRead);
        // console.log('worker received', res);
        sumLocal += i*2;
        sumRemote += res.payload
    }
    console.log('end', sumLocal, sumRemote)
}