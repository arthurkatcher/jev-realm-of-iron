# Sound sources for the Warcraft-II-style RTS

All files were downloaded 2026-09-25 from the URLs below; the licence was read off
the source page (OpenGameArt "License(s)" field, Kenney License.txt inside the zip,
freesound licence badge). Processing (ffmpeg): silence trimmed at both ends,
peak-normalised to -1 dBFS, mono 44.1 kHz, Ogg Vorbis q4. Music: stereo Ogg Vorbis
q4 at -3 dB, no trimming. Original filenames are given so the processed clip can be
traced back.

## Licence summary

| Licence | Requirement |
|---|---|
| CC0 1.0 | none (credit optional) |
| CC-BY 3.0 | credit author + link, note changes |
| CC-BY 4.0 | credit author + link, note changes |

Suggested one-paragraph credits block for the game (covers every CC-BY item):

> Sound effects by Kenney (kenney.nl, CC0); artisticdude (opengameart.org, CC-BY 3.0);
> Little Robot Sound Factory (www.littlerobotsoundfactory.com, CC-BY 3.0);
> Michel Baradari (apollo-music.de, via opengameart.org, CC-BY 3.0); leohpaz
> (opengameart.org, CC-BY 4.0); rubberduck, Brandon Song (wolfwoot), Thimras, Joth,
> fvcalderan, StumpyStrust, Independent.nu, Julien Matthey (all CC0).
> Music by RandomMind (opengameart.org, CC0). Clips were trimmed, normalised and
> re-encoded.

## Sound effects (sfx/)

### Kenney - Impact Sounds (CC0)
- Source page: https://kenney.nl/assets/impact-sounds
- Zip: https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip
- Author: Kenney (www.kenney.nl). Licence: CC0 1.0 (License.txt in zip: "License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ ... crediting Kenney or www.kenney.nl (this is not mandatory)")
- Files: axe_hit (impactWood_heavy_000.ogg), club_hit (impactPunch_heavy_000.ogg), mine_1 (impactMining_000.ogg), mine_2 (impactMining_001.ogg), lumber_delivered (impactPlank_medium_000.ogg)

### TinyWorlds - 5 Hit Sounds + Dying (CC0): melee hits
- Source page: https://opengameart.org/content/5-hit-sounds-dying (author TinyWorlds, licence CC0 1.0)
- Files: sword_hit_1, sword_hit_2, sword_hit_3.
- Restored 2026-09-26 at the player's request. The synthesised sword clashes that replaced them the same day
  (`tools/synth_sword_clash.py`) sounded like a bell; they are kept as `assets/_candidates/sounds_replaced/sword_hit_N.synth.ogg`.

### Kenney - RPG Audio (CC0)
- Source page: https://kenney.nl/assets/rpg-audio
- Zip: https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip
- Author: Kenney. Licence: CC0 1.0 (License.txt in zip)
- Files: wood_chop (chop.ogg), gold_delivered (handleCoins.ogg)

### Kenney - Interface Sounds (CC0)
- Source page: https://kenney.nl/assets/interface-sounds
- Zip: https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip
- Author: Kenney. Licence: CC0 1.0 (License.txt in zip)
- Files: unit_ready (confirmation_002.ogg), error (error_006.ogg)

### Kenney - UI Audio (CC0)
- Source page: https://kenney.nl/assets/ui-audio
- Zip: https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip
- Author: Kenney. Licence: CC0 1.0 (License.txt in zip)
- Files: ui_click (click1.ogg)

### RPG Sound Pack - artisticdude (CC0)
- Source page: https://opengameart.org/content/rpg-sound-pack
- Zip: https://opengameart.org/sites/default/files/rpg_sound_pack.zip
- Author: artisticdude. Licence: CC0 (OGA licence field)
- Files: sword_swing (battle/swing.wav), spell_cast (battle/magic1.wav), select_orc_1 (NPC/ogre/ogre1.wav), select_orc_2 (NPC/ogre/ogre2.wav), ui_select (interface/interface1.wav)

### Battle Sound Effects - artisticdude (CC-BY 3.0)
- Source page: https://opengameart.org/content/battle-sound-effects
- Zip: https://opengameart.org/sites/default/files/battle_sound_effects_0.zip
- Author: artisticdude (submitted by Ogrebane). Licence: CC-BY 3.0 (OGA licence field; NOTE: the page is CC-BY 3.0, not CC0)
- Required attribution: "Bow sound by artisticdude, https://opengameart.org/content/battle-sound-effects, CC-BY 3.0 (trimmed/normalised)"
- Files: arrow_shot (Bow.wav)

### 75 CC0 breaking / falling / hit sfx - rubberduck (CC0)
- Source page: https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx
- Zip: https://opengameart.org/sites/default/files/sfx_breaking_and_falling.zip
- Author: rubberduck. Licence: CC0
- Files: arrow_hit (bfh1_wood_hit_01.ogg), building_destroyed_stone (bfh1_rock_breaking_01.ogg)

### 100 CC0 metal and wood SFX - rubberduck (CC0)
- Source page: https://opengameart.org/content/100-cc0-metal-and-wood-sfx
- Zip: https://opengameart.org/sites/default/files/100-CC0-wood-metal-SFX.zip
- Author: rubberduck. Licence: CC0
- Files: hammer_1 (wood_hammer_01.ogg), hammer_2 (wood_hammer_02.ogg), hammer_3 (hammer_01.ogg)

### Cannon fire - Thimras (CC0)
- Source page: https://opengameart.org/content/cannon-fire
- File: https://opengameart.org/sites/default/files/cannon_fire_0.ogg
- Author: Thimras. Licence: CC0
- Files: catapult_fire (cannon_fire_0.ogg, cut to 1.8 s with fade)

### Chunky Explosion - Joth (CC0)
- Source page: https://opengameart.org/content/chunky-explosion
- File: https://opengameart.org/sites/default/files/Chunky%20Explosion.mp3
- Author: Joth. Licence: CC0
- Files: explosion (cut to 2.5 s with fade)

### Fireball - Julien Matthey (CC0)
- OGA page: https://opengameart.org/content/fireball-1 (submitted by diligentcircle, licence field CC0)
- Original: https://freesound.org/people/Julien%20Matthey/sounds/105016/ (freesound badge: Creative Commons 0, creativecommons.org/publicdomain/zero/1.0/)
- File: https://opengameart.org/sites/default/files/105016__julien-matthey__jm-fx-fireball-01.wav
- Author: Julien Matthey. Licence: CC0
- Files: fireball

### 8 Heals and Buffs SFX - leohpaz (CC-BY 4.0)
- Source page: https://opengameart.org/content/8-heals-and-buffs-sfx
- Zip: https://opengameart.org/sites/default/files/8_rpg_heals_buffs_sfx_samples.zip
- Author: leohpaz. Licence: CC-BY 4.0 (OGA licence field; page has no extra notice)
- Required attribution: "Heal sound by leohpaz, https://opengameart.org/content/8-heals-and-buffs-sfx, CC-BY 4.0 (trimmed/normalised)"
- Files: heal (02_Heal_02.wav)

### Classic fanfare lick - fvcalderan (CC0)
- Source page: https://opengameart.org/content/classic-fanfare-lick
- File: https://opengameart.org/sites/default/files/fanfare_3.ogg
- Author: fvcalderan. Licence: CC0
- Files: building_complete

### 35 wooden cracks/hits/destructions - Independent.nu (CC0)
- Source page: https://opengameart.org/content/35-wooden-crackshitsdestructions
- Archive: https://opengameart.org/sites/default/files/independent_nu_ljudbank-wood_crack_hit_destruction.7z
- Author: Independent.nu (submitted by qubodup). Licence: CC0
- Files: building_destroyed_wood (wood_impact/crack01.mp3.flac, cut to 2 s)

### Voice Clip Pack - Male Adventurer RPG - wolfwoot / Brandon Song (CC0)
- Source page: https://opengameart.org/content/voice-clip-pack-male-adventurer-rpg
- Zip: https://opengameart.org/sites/default/files/RPG%20Male%20Adventurer.zip
- Author: wolfwoot. Licence: CC0. Page notice: "Credit is appreciated as 'Brandon Song'" (optional)
- Files: ack_human_yes_1 (yes0.wav), ack_human_yes_2 (yes1.wav), select_human_greet (greet0.wav), annoyed_human_no (no0.wav), attack_human (attack0.wav), death_human_1 (death1.wav), death_human_2 (death0.wav, cut to 2 s)

### 15 monster grunt/pain/death sounds - Michel Baradari (CC-BY 3.0)
- Source page: https://opengameart.org/content/15-monster-gruntpaindeath-sounds
- Archive: https://opengameart.org/sites/default/files/michelbaradari-monsters.7z
- Author: Michel Baradari (submitted by qubodup). Licence: CC-BY 3.0 (OGA licence field)
- Required attribution: "Monster grunts and death sounds by Michel Baradari, https://opengameart.org/content/15-monster-gruntpaindeath-sounds, CC-BY 3.0 (trimmed/normalised)"
- Files: ack_orc_1 (grunt1.wav), ack_orc_2 (grunt2.wav), ack_orc_3 (piggrunt1.wav), death_orc_1 (deathr.wav), death_orc_2 (deaths.wav)

### Their Coming (generic horn sound) - StumpyStrust (CC0)
- Source page: https://opengameart.org/content/their-coming-generic-horn-sound
- File: https://opengameart.org/sites/default/files/theircoming3_0.ogg
- Author: StumpyStrust. Licence: CC0
- Files: alarm_horn (cut to 3.2 s with fade)

### Fantasy Sound Effects Library - Little Robot Sound Factory (CC-BY 3.0)
- Source page: https://opengameart.org/content/fantasy-sound-effects-library
- Zip: https://opengameart.org/sites/default/files/Fantasy%20Sound%20Library.zip
- Author: Little Robot Sound Factory. Licence: CC-BY 3.0
- Required attribution (from page): "Attribute Little Robot Sound Factory, and provide this link where possible: www.littlerobotsoundfactory.com"
- Files: victory (Wav/Jingle_Win_00.wav), defeat (Wav/Jingle_Lose_00.wav)

## Music (music/)

### Medieval series - RandomMind (CC0)
- Author: RandomMind (https://opengameart.org/users/randommind). Licence: CC0 on every page (OGA licence field).
- bgm_market_day_loop: https://opengameart.org/content/medieval-market-day - https://opengameart.org/sites/default/files/Loop_Market_Day_0.mp3 (65 s, seamless loop version)
- bgm_old_tower_inn: https://opengameart.org/content/medieval-the-old-tower-inn - https://opengameart.org/sites/default/files/The_Old_Tower_Inn.mp3 (105 s)
- bgm_kings_feast: https://opengameart.org/content/medieval-kings-feast - https://opengameart.org/sites/default/files/Kings_Feast_0.mp3 (130 s)
- bgm_exploration: https://opengameart.org/content/medieval-exploration - https://opengameart.org/sites/default/files/Exploration_0.mp3 (236 s, ambient)
- bgm_battle: https://opengameart.org/content/medieval-battle - https://opengameart.org/sites/default/files/battle_8.mp3 (79 s)
- bgm_defeat_theme: https://opengameart.org/content/medieval-defeat-theme - https://opengameart.org/sites/default/files/defeat_0.mp3 (45 s, sombre)
- Note: the source MP3s were re-encoded to Ogg Vorbis q4 (lossy-to-lossy); the originals are MP3 320/192/128 kbps.

## Downloaded but NOT used (kept only in raw/, may be deleted)
- Kenney UI/Interface remaining clips, 5 Hit Sounds + Dying (TinyWorlds, CC0), Blacksmith's Hammer (VishwaJai, CC0), Hammer on Anvil / Fast Hammer (themightyglider, CC0), 3 Heal Spells (DoKashiteru, CC-BY 3.0), Hyper-Ultra-Fanfare (Zane Little, CC0), Scary Echoey Horn (Kat, CC-BY 4.0), grunts of male death and pain (thebardofblasphemy, CC0), Medieval fair loop (Woli34, CC0), Celtic Loop (stereoscopic, CC0), Medieval: Minstrel Dance / Rejoicing (RandomMind, CC0).
