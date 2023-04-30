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

function ctrlWait () {
    // console.log('worker - wait')
    Atomics.store(ctrlBuffer, 0, 0)
    Atomics.wait(ctrlBuffer, 0, 0)
    return ctrlBuffer[0]
}

function ctrlSignal (value) {
    // console.log('worker - signal', value)
    Atomics.store(ctrlBuffer, 1, value)
    Atomics.notify(ctrlBuffer, 1)
}

function writeMessage(res) {
    // console.log('worker - writing message', res)
    var resJson = JSON.stringify(res)
    encoder.encodeInto(resJson, encodeBuffer)
    // valueBuffer.set(encoder, 0)
    for (let i = 0; i < resJson.length; i++) {
        Atomics.store(valueBuffer, i, encodeBuffer[i])
    }
    ctrlSignal(resJson.length)
}

function readMessage() {
    // console.log('worker - read')
    var resSize = ctrlWait()

    for (let i = 0; i < resSize; i++) {
        decodeBuffer[i] = Atomics.load(valueBuffer, i)
    }
    var res = decoder.decode(decodeBuffer.slice(0, resSize))
    // console.log('worker - read', res)
    return JSON.parse(res)
}

function syncCall (...args) {
    writeMessage(args);
    //self.postMessage(args)
    return readMessage();
}

function main () {
    console.log('worker main starting')
    console.log(syncCall('hello', 'world'))

    // benchmark
    //

    console.time('local')
    var r1 = []
    for (let i = 0; i < 1000; i++) {
        r1.push(hello(i)) // this will get inlined so it's not really a great benchmark
    }
    console.timeEnd('local')

    console.time('remote')
    var r2 = []
    for (let i = 0; i < 1000; i++) {
        r2.push(syncCall('hello', i))
    }
    console.timeEnd('remote')
    console.log('end')
}

function hello (str) {
    return `hello ${str}`
}