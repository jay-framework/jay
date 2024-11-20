# Jay Secure

> EXPERIMENTAL - THE JAY-SECURE MODULE IS NOT HARDENED YET TO BE USED FOR SECURITY.

The Jay Secure library is the runtime library supporting the sandbox feature of Jay - running headless Jay Components
in a sandbox, while running the heads, the Jay Element on the main thread.

The Jay Secure library includes a few runtime utilities and functions supporting the application split of main and sandbox.

> In Jay, we denote main or trusted as the main window, and sandbox or worker as the worker environment.

## comm channel

A messaging based protocol between the main and sandbox environments, allowing for an efficient communication.
The comm channel will batch multiple messages into a single `postMessage` browser call.

When creating applications that require sandbox, the setup of the comm channel on the main side is

```typescript
const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
  type: 'module',
});

window.onload = function () {
  setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
  // ... setup the application
};
```

and on the sandbox or worker side as

```typescript
// import the application root jay-html file
setWorkerPort(new JayPort(new HandshakeMessageJayChannel(this)));
```

See the [examples](../../../examples) for a complete setup.

## main and sandbox

The library includes various implementations of component bridges, element bridges, element creation functions and other
utilities needed for the security module runtime.

## Additional information

See the following design log for explanation of the design process and "how it works":

- [02 - Jay Element vs Component.md](../../../design-log/02%20-%20Jay%20Element%20vs%20Component.md)
- [09 - Safe events.md](../../../design-log/09%20-%20Safe%20events.md)
- [29 - algorithm to split safe code.md](../../../design-log/29%20-%20algorithm%20to%20split%20safe%20code.md)
- [17 - main and sandbox secure contexts.md](../../../design-log/17%20-%20main%20and%20sandbox%20secure%20contexts.md)
