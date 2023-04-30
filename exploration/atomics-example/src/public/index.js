const RES_SIZE = 256
const encoder = new TextEncoder('utf8')

var myWorker = new Worker('/worker.js')
console.log(myWorker)

const exportedMethods = {
    hello (str) {
        return `hello ${str}`
    }
}

const sharedCtrlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
const ctrlBuffer = new Int32Array(sharedCtrlBuffer)
const sharedValueBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * RES_SIZE)
const valueBuffer = new Int32Array(sharedValueBuffer)
const encodeBuffer = new Uint8Array(RES_SIZE) // TextEncoder cant use SharedArrayBuffers

function ctrlSignal (value) {
    Atomics.store(ctrlBuffer, 0, value)
    Atomics.notify(ctrlBuffer, 0)
}

myWorker.onmessage = (e) => {
    console.log('worker on message')
    // call method
    var [methodName, ...methodArgs] = e.data
    // console.debug('calling', methodName, methodArgs)
    var res = exportedMethods[methodName](...methodArgs)

    // write response
    // console.debug('writing response')
    var resJson = JSON.stringify(res)
    encoder.encodeInto(resJson, encodeBuffer)
    // valueBuffer.set(encoder, 0)
    for (let i = 0; i < resJson.length; i++) {
        Atomics.store(valueBuffer, i, encodeBuffer[i])
    }

    // notify success and chunk count
    // console.debug('notifying response, size:', resJson.length)
    ctrlSignal(resJson.length)
}
console.log('posting message to worker')
myWorker.postMessage({sharedCtrlBuffer, sharedValueBuffer})