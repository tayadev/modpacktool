## TODO / Issues

- Calls made from lua aren't being waited for completion, thus if we need to download files, we start assembling the modpack before the files are downloaded. This is a problem.
  - Temporary solution: run it twice, first to download the files, then to assemble the modpack.

- Curseforge and Modrinth Exporters are not implemented yet.
- Environment specific file overrides are not implemented yet.
- Curseforge as a content source is not implemented yet.


## Done

- metadata
  - name
  - description
  - version
  - author
  - url
  - icon
- dependencies
  - minecraft
  - modloader
- file
- config
- mod
- shader

## Usage

```
   mpt [options] <file>

   Arguments:
    file                 The pack file to load

  Options:
    -V, --version        output the version number
    -o, --output <file>  The output file to write to (default: "output")
    -t, --type <type>    The type of pack to create (default: "mmc")
    -h, --help           display help for command
```