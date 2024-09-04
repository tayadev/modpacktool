-- Define pack metadata
name 'testpack'
description 'Test pack'
author 'Author'
version '1.0.0'
url 'https://example.com'
icon 'icon.png'

-- Define pack base dependencies/versions
minecraft '1.20.1'
modloader 'forge@47.3.7'

-- Define pack mods
mod 'ae2@15.2.13'

mod 'jade@11.7.1'

-- mod 'cf:waystones@14.1.5' -- mod from a specific source (CurseForge)

-- Define a config file in .minecraft/config
config {
  path = 'jade/jade.json',
  content = json {
    overlay = {
      alpha = 0.0,
      overlayPosX = 0.0,
      overlayAnchorX = 0.0
    }
  }
}

-- Define an arbitrary file in .minecraft
file {
  path = 'options.txt',
  content = 'fullscreen:true'
}

-- Get a shaderpack
shader 'complementary-unbound@r5.2.2'

-- Include another Lua file
include 'macaws-mods.lua'