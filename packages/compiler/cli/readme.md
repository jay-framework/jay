# jay cli

The jay cli is a utility for build and dev time that generate files from jay-html files.

## definitions

The definitions command generates the `.d.ts` files for `.jay-html` files, which are then
used for development. The `.d.ts` files are placed along side the `.jay-html` files.

```shell
jay-cli definitions source
```

- `source` - the source folder to scan for `.jay-html` files

## runtime

The runtime command generates the runtime files for jay-html files.
Normally, those files are created by the vite-plugin and not created explicitly.

```shell
jay-cli runtime source destination
```

- `source` - the source folder to scan for `.jay-html` files
- `destination` - the folder to create the files in
