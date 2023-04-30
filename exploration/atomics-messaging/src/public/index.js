const RES_SIZE = 256
const encoder = new TextEncoder('utf8')
const decoder = new TextDecoder('utf8')

var myWorker = new Worker('/worker.js')

const exportedMethods = {
    hello (str) {
        return `hello ${str}`
    }
}

const sharedCtrlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*2)
const ctrlBuffer = new Int32Array(sharedCtrlBuffer)
const sharedValueBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * RES_SIZE)
const valueBuffer = new Int32Array(sharedValueBuffer)
const encodeBuffer = new Uint8Array(RES_SIZE) // TextEncoder cant use SharedArrayBuffers
const decodeBuffer = new Uint8Array(RES_SIZE) // TextDecoder cant use SharedArrayBuffers

function ctrlSignal (value) {
    // console.log('main - signal', value)
    Atomics.store(ctrlBuffer, 0, value)
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
    // console.log('main - wait')
    Atomics.store(ctrlBuffer, 1, 0)
    let waitResult = Atomics.waitAsync(ctrlBuffer, 1, 0)
    return waitResult.value.then(() => ctrlBuffer[1])
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

    // write response
    // console.debug('writing response')
    writeMessage(res);
}
console.log('posting message to worker')

myWorker.postMessage({action: 'init', sharedCtrlBuffer, sharedValueBuffer})

window.onload = () => {
    document.getElementById('start').onclick =() => {
        myWorker.postMessage({action: 'start'})
    }
};

function handleMessage(m) {
    var [methodName, ...methodArgs] = m;
    var res = exportedMethods[methodName](...methodArgs)
    writeMessage(res);
    readMessage().then(handleMessage)
}

readMessage().then(handleMessage)
