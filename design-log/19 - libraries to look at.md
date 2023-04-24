Libraries to look at
==============

bling
------

interesting approach for file splitting client and server. Worth considering for Jay Components.

https://github.com/tanstack/bling

```
import { server$ } from '@tanstack/bling'

const fetchFn = server$(async (payload) => {
  // do something
  return 'result'
})
```

```
import { secret$ } from '@tanstack/bling'

const secretMessage = secret$('It is a secret!')')
```

```
import { import$ } from '@tanstack/bling'

const fn = await import$(async (name: string) => {
  return `Hello ${name}`
})
```
