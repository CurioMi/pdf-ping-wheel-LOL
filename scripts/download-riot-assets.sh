#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/riot/textures public/riot/sounds public/riot/emotes public/riot/mastery
ping_base="https://raw.githubusercontent.com/darrenprx/lolPing/main/assets"
emote_base="https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/loadouts/summoneremotes/flairs"
mastery_base="https://raw.communitydragon.org/14.9/game/assets/ux/mastery"

fetch_asset() {
  local url="$1"
  local output="$2"
  curl --fail --location --silent --show-error --retry 3 --retry-delay 1 "$url" -o "$output"
  test -s "$output"
}

for file in \
  pingwheel_retreatrender.png pingwheel_pushrender.png omw_cyan.png png_all_in.png \
  png_assist_me_128x128.png mt11_18_vision.png png_enemymissing_128x128.png \
  pingwheel_enemyvisionrender.png pingwheel_basicpingrender.png; do
  fetch_asset "$ping_base/textures/$file" "public/riot/textures/$file"
done

for file in SRP_12.wav SRP_9.wav OnMyWay.wav SRP_4.wav ComeHere.wav SRP_7.wav MIA.wav AreaIsWarded.wav Base.wav; do
  fetch_asset "$ping_base/sounds/$file" "public/riot/sounds/$file"
done

for file in \
  thumb_happy_up_inventory.png cupcake_happy_smiling_inventory.png em_bee_angry_inventory.png \
  em_bee_happy_inventory.png em_bee_sad_inventory.png em_hype_pengu_blue_inventory.png \
  em_hype_pengu_orange_inventory.png em_minion_shy_inventory.png penguin_meme_dab_inventory.png; do
  fetch_asset "$emote_base/$file" "public/riot/emotes/$file"
done

fetch_asset "$mastery_base/mastery_icon_7.png" "public/riot/mastery/mastery_icon_7.png"

node --input-type=module <<'NODE'
import fs from 'node:fs'
const root = 'public/riot'
const pngs = [
  'textures/pingwheel_retreatrender.png','textures/pingwheel_pushrender.png','textures/omw_cyan.png',
  'textures/png_all_in.png','textures/png_assist_me_128x128.png','textures/mt11_18_vision.png',
  'textures/png_enemymissing_128x128.png','textures/pingwheel_enemyvisionrender.png','textures/pingwheel_basicpingrender.png',
  'emotes/thumb_happy_up_inventory.png','emotes/cupcake_happy_smiling_inventory.png','emotes/em_bee_angry_inventory.png',
  'emotes/em_bee_happy_inventory.png','emotes/em_bee_sad_inventory.png','emotes/em_hype_pengu_blue_inventory.png',
  'emotes/em_hype_pengu_orange_inventory.png','emotes/em_minion_shy_inventory.png','emotes/penguin_meme_dab_inventory.png',
  'mastery/mastery_icon_7.png'
]
const wavs = ['SRP_12.wav','SRP_9.wav','OnMyWay.wav','SRP_4.wav','ComeHere.wav','SRP_7.wav','MIA.wav','AreaIsWarded.wav','Base.wav']
for (const file of pngs) {
  const b = fs.readFileSync(root + '/' + file)
  if (b.length < 64 || !b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG: ' + file)
}
for (const file of wavs) {
  const b = fs.readFileSync(root + '/sounds/' + file)
  if (b.length < 44 || b.toString('ascii',0,4) !== 'RIFF' || b.toString('ascii',8,12) !== 'WAVE') throw new Error('Invalid WAV: ' + file)
}
console.log('Validated 19 PNG assets and 9 WAV assets.')
NODE

# Complete emote library, pinned to the checked-in catalog snapshot.
node scripts/sync-emotes.mjs --download-only
