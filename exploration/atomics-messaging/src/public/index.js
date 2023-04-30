const RES_SIZE = 256
const encoder = new TextEncoder('utf8')
const decoder = new TextDecoder('utf8')

var myWorker = new Worker('/worker.js')

const sharedCtrlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*4)
const ctrlBuffer = new Int32Array(sharedCtrlBuffer)
const sharedValueBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * RES_SIZE)
const valueBuffer = new Int32Array(sharedValueBuffer)
const encodeBuffer = new Uint8Array(RES_SIZE) // TextEncoder cant use SharedArrayBuffers
const decodeBuffer = new Uint8Array(RES_SIZE) // TextDecoder cant use SharedArrayBuffers

function ctrlSignal (value) {
    // console.log('main - signal', value)
    Atomics.store(ctrlBuffer, 1, value)
    Atomics.store(ctrlBuffer, 0, 1)
    Atomics.notify(ctrlBuffer, 0)
}

function writeMessage(res) {
    // console.log('main - write message', res)
    var resJson = JSON.stringify(res)
    encoder.encodeInto(resJson, encodeBuffer)
    // valueBuffer.set(encoder, 0)
    for (let i = 0; i < resJson.length; i++) {
        Atomics.store(valueBuffer, i, encodeBuffer[i])
    }
    return resJson.length;
    // ctrlSignal(resJson.length)
}

function ctrlWait () {
    Atomics.store(ctrlBuffer, 2, 0)
    let waitResult = Atomics.waitAsync(ctrlBuffer, 2, 0)
    if (!waitResult.async)
        console.log(waitResult.value)
    return waitResult.value.then(() => {
        // console.log('main - wait', ctrlBuffer[2], ctrlBuffer[3])
        return ctrlBuffer[3]
    })
}

function readMessage(resSize) {
    // console.log('main - read message')
        for (let i = 0; i < resSize; i++) {
            decodeBuffer[i] = Atomics.load(valueBuffer, i)
        }
        var res = decoder.decode(decodeBuffer.slice(0, resSize))
        // console.log('main - read message', res)
        return JSON.parse(res)
}

function notifyAndWait(writtenBytes) {
    // reset the bit to wait on
    Atomics.store(ctrlBuffer, 1, 0)
    // write number of bytes written
    Atomics.store(ctrlBuffer, 0, writtenBytes)
    // notify on next message index
    Atomics.notify(ctrlBuffer, 0)
    // wait on the wait biy
    let waitResult = Atomics.waitAsync(ctrlBuffer, 1, 0)
    if (!waitResult.async) {
        // the worker has finished between the call to notify(0) and waitAsync(2), so we can just return the value
        return Promise.resolve(ctrlBuffer[1])
    }
    return waitResult.value.then(() => {
        return ctrlBuffer[1]
    })
}


myWorker.onmessage = (e) => {
    console.log('worker on message')
    // call method
    var [methodName, ...methodArgs] = e.data
    // console.debug('calling', methodName, methodArgs)
    var res = exportedMethods[methodName](...methodArgs)

    // writeMessage(res);
}
console.log('posting init message to worker')
myWorker.postMessage({action: 'init', sharedCtrlBuffer, sharedValueBuffer})

window.onload = () => {
    document.getElementById('start').onclick =() => {
        myWorker.postMessage({action: 'start'})
    }
};

function handleMessage(m) {
    // console.log('main received', m)
    let bytesWritten = writeMessage({id: m.id, payload: m.payload + ' back'});
    notifyAndWait(bytesWritten)
        .then(bytesToRead => readMessage(bytesToRead))
        .then(handleMessage)
}

handleMessage({id: 0, payload: 'start'})
// readMessage().then(handleMessage)
