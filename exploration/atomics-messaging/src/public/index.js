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
var messageIndex = 0;

function ctrlSignal (value) {
    // console.log('main - signal', value)
    Atomics.store(ctrlBuffer, 1, value)
    Atomics.store(ctrlBuffer, 0, messageIndex++)
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
    ctrlSignal(resJson.length)
}

function ctrlWait () {
    Atomics.store(ctrlBuffer, 2, 0)
    let waitResult = Atomics.waitAsync(ctrlBuffer, 2, 0)
    return waitResult.value.then(() => {
        // console.log('main - wait', ctrlBuffer[2], ctrlBuffer[3])
        return ctrlBuffer[3]
    })
}

function readMessage() {
    // console.log('main - read message')
    return ctrlWait().then(resSize => {
        for (let i = 0; i < resSize; i++) {
            decodeBuffer[i] = Atomics.load(valueBuffer, i)
        }
        var res = decoder.decode(decodeBuffer.slice(0, resSize))
        // console.log('main - read message', res)
        return JSON.parse(res)
    })
}


myWorker.onmessage = (e) => {
    console.log('worker on message')
    // call method
    var [methodName, ...methodArgs] = e.data
    // console.debug('calling', methodName, methodArgs)
    var res = exportedMethods[methodName](...methodArgs)

    writeMessage(res);
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
    writeMessage({id: m.id, payload: m.payload + ' back'});
    readMessage().then(handleMessage)
}

readMessage().then(handleMessage)
