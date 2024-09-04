import { LuaFactory } from "wasmoon"
import fs from "node:fs/promises"
import {default as fspath} from "node:path"
import { program } from "commander"

enum RequirementType {
  required,
  unsupported,
  optional
}

interface Modpack {
  name: string
  description: string
  version: string
  author: string
  url: string
  icon: string
  dependencies: {id: string, version: string}[]
  external_files: {path: string, hashes: {sha1: string, sha256: string}, downloads: string[], fileSize: number, env: {client: RequirementType, server: RequirementType}}[],
  files: {path: string, content: Blob}[]
  server_files: {path: string, content: Blob}[]
  client_files: {path: string, content: Blob}[]
}

const luafactory = new LuaFactory()

async function getContentMeta(id: string, version: string, mc_version: string, loader: string) {
  const res = await fetch(`https://api.modrinth.com/v2/project/${id}/version?loaders=${loader}&game_versions=${mc_version}`)
  const versions = await res.json()

  if (!version) {
    const latest_version = versions.find((v: any) => v.loaders.includes(loader) && v.game_versions.includes(mc_version))
    console.log(`No version specified for ${id}, latest compatible version is ${latest_version.version_number}`)
    return
  }

  const wanted_version = versions.find((v: any) => v.version_number === version && v.loaders.includes(loader) && v.game_versions.includes(mc_version))
  if (!wanted_version) {
    throw new Error(`Cannot find version ${version} for ${id} in ${mc_version}/${loader}`)
  }

  const url = wanted_version.files[0].url
  const fileSize = wanted_version.files[0].size
  const hashes = wanted_version.files[0].hashes

  return {
    url,
    hashes,
    fileSize
  }
}

const pack: Modpack = {
  name: '',
  description: '',
  version: '',
  author: '',
  url: '',
  icon: '',
  dependencies: [],
  external_files: [],
  files: [],
  server_files: [],
  client_files: []
}

async function parsePackFile(file: string) {

  const getMcVersion = () => {
    return pack.dependencies.find(dep => dep.id === 'minecraft')?.version
  }

  const getLoader = () => {
    return pack.dependencies.find(dep => dep.id !== 'minecraft')?.id
  }

  const lua = await luafactory.createEngine()

  lua.global.set('name', (name: string) => pack.name = name)
  lua.global.set('description', (description: string) => pack.description = description)
  lua.global.set('version', (version: string) => pack.version = version)
  lua.global.set('author', (author: string) => pack.author = author)
  lua.global.set('url', (url: string) => pack.url = url)
  lua.global.set('icon', (icon: string) => pack.icon = icon)

  lua.global.set('minecraft', (version: string) => pack.dependencies.push({id: 'minecraft', version: version}))
  lua.global.set('modloader', (ml: string) => {
    const [id, version] = ml.split('@')
    pack.dependencies.push({id: id, version: version})
  })

  // TODO: configurable content sources

  lua.global.set('file', (f: any) => {
    console.log(`[+] File ${f.path}`)
    const {path, content} = f
    pack.files.push({path: path, content: content})
  })

  lua.global.set('config', (c: any) => {
    console.log(`[+] Config ${c.path}`)
    const {path, content} = c
    pack.files.push({path: fspath.join('config', path), content: content})
  })

  lua.global.set('mod', async (m: string) => {
    const [id, version] = m.split('@')
    const {url, hashes, fileSize} = await getContentMeta(id, version, getMcVersion(), getLoader())
    
    console.log(`[+] Mod ${m}`)
    pack.external_files.push({
      path: fspath.join('mods', `${id}-${version}.jar`),
      downloads: [url],
      hashes,
      fileSize,
      env: { // TODO: make this configurable
        client: RequirementType.required,
        server: RequirementType.required
      }
    })
  })

  lua.global.set('shader', async (s: string) => {
    const [id, version] = s.split('@')
    const {url, hashes, fileSize} = await getContentMeta(id, version, getMcVersion(), 'iris')
    
    console.log(`[+] Shader ${s}`)
    pack.external_files.push({
      path: fspath.join('shaderpacks', `${id}-${version}.zip`),
      downloads: [url],
      hashes,
      fileSize,
      env: {
        client: RequirementType.required,
        server: RequirementType.unsupported
      }
    })
  })

  lua.global.set('json', (data: any) => JSON.stringify(data))

  lua.global.set('include', async (i_file: string) => {
    console.log(`[+] Including ${i_file}`)
    const dir = fspath.dirname(file)
    const path = fspath.join(dir, i_file)
    await parsePackFile(path)
  })

  const file_content = await Bun.file(file).text()
  await lua.doString(file_content)
  lua.global.close()
}

// Assembles the Modpack as a multimc instance
function assembleMMCPack(pack: Modpack, output_dir: string) {

  // instance.cfg
  Bun.write(fspath.join(output_dir, 'instance.cfg'), `[General]\nConfigVersion=1.2\niconKey=default\nname=${pack.name}\nInstanceType=OneSix\n`) 

  // mmc-pack.json

  function getComponent(loader: string, version: string) {
    switch (loader) {
      case 'forge':
        return {
          uid: `net.minecraftforge`,
          version: version
        }
      case 'fabric':
        return {
          cachedName: 'Fabric Loader',
          cachedVersion: version,
          cachedRequires: [
            {
              uid: 'net.fabricmc.intermediary',
            }
          ],
          uid: 'net.fabricmc.fabric-loader',
          version: version
        }
    }
  }

  Bun.write(fspath.join(output_dir, 'mmc-pack.json'), JSON.stringify({
    formatVersion: 1,
    components: [
      {
        cachedName: 'Minecraft',
        cachedVersion: pack.dependencies.find(dep => dep.id === 'minecraft')?.version,
        important: true,
        uid: 'net.minecraft',
        version: pack.dependencies.find(dep => dep.id === 'minecraft')?.version
        // TODO: figure out if cachedRequires lwjgl would be needed
      },
      ...pack.dependencies.filter(dep => dep.id !== 'minecraft').map(dep => getComponent(dep.id, dep.version))
    ]
  }))

  // files, server_files, client_files
  pack.files.forEach(f => {
    Bun.write(fspath.join(output_dir, '.minecraft', f.path), f.content)
  })

  // TODO: specific env support

  // external_files
  pack.external_files.forEach(async f => {
    const {path, downloads} = f

    const res = await fetch(downloads[0])
    const content = await res.blob()

    Bun.write(fspath.join(output_dir, '.minecraft', path), content)
  })

}

// Assembles the Modpack in the .mrpack format
function assembleModrinthPack(pack: Modpack, output_dir: string) {
  throw new Error('Not implemented')
}

// Assembles the Modpack as a curseforge pack
function assembleCurseForgePack(pack: Modpack, output_dir: string) {
  throw new Error('Not implemented')
}


program
  .name('mpt')
  .description('Tool to create minecraft modpacks')
  .version('1.0.0')
  .argument('<file>', 'The pack file to load')
  .option('-o, --output <file>', 'The output file to write to', 'output')
  .option('-t, --type <type>', 'The type of pack to create', 'mmc')

program.parse()

const file = program.args[0]
const output = program.opts().output
const type = program.opts().type

await parsePackFile(file)

// FIXME: this is fucking jank
await new Promise( resolve => setTimeout(resolve, 2000) );

console.log(JSON.stringify(pack))

switch(type) {
  case 'mmc':
    assembleMMCPack(pack, output)
    break;
  
  case 'modrinth':
    assembleModrinthPack(pack, output)
    break;
  
  case 'curseforge':
    assembleCurseForgePack(pack, output)
    break;
  
  default:
    console.log(`Unknown modpack type ${type}`)
}