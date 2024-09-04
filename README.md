## TODO / Issues

- Calls made from lua aren't being waited for completion, thus if we need to download files, we start assembling the modpack before the files are downloaded. This is a problem.
  - Temporary solution: run it twice, first to download the files, then to assemble the modpack.