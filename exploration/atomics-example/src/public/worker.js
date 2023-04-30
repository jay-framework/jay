const RES_SIZE = 256
const decoder = new TextDecoder('utf8')

var ctrlBuffer
var valueBuffer
var decodeBuffer = new Uint8Array(RES_SIZE) // TextDecoder cant use SharedArrayBuffers


console.log('worker starting!!!')

self.addEventListener('message', e => {
    console.debug('worker started')
    const {sharedCtrlBuffer, sharedValueBuffer} = e.data
    ctrlBuffer = new Int32Array(sharedCtrlBuffer)
    valueBuffer = new Int32Array(sharedValueBuffer)
    main()
}, false)

function ctrlWait () {
    Atomics.store(ctrlBuffer, 0, 0)
    Atomics.wait(ctrlBuffer, 0, 0)
    return ctrlBuffer[0]
}

function syncCall (...args) {
    // send call
    self.postMessage(args)

    // wait
    var resSize = ctrlWait()
    // console.debug('response size:', resSize)

    // read response
    for (let i = 0; i < resSize; i++) {
        decodeBuffer[i] = Atomics.load(valueBuffer, i)
    }
    // decodeBuffer.set(valueBuffer)
    var res = decoder.decode(decodeBuffer.slice(0, resSize))
    // console.debug('res received', res, res.length)

    return JSON.parse(res)
}

function main () {
    // test
    //

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
}

function hello (str) {
    return `hello ${str}`
}