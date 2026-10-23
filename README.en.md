# Dlaoshi Outfit — a desktop pet & glass theme for DeepSeek Harness

A draggable anime desktop pet (a maid-outfit character), a bottom-right standee that
reports each turn's token usage and thinking time, a chat wallpaper, a liquid-glass
composer, and a deep-sea blue theme — all in one zero-dependency DSH plugin.

![preview](docs/preview.png)

## Features

- **Floating pet** with four expressions, free dragging, remembered position
- **State machine**: thinking while streaming, happy on success, sad on failure
- **Click to cycle** expressions, with speech bubbles and idle expiry
- **Corner standee**: a thought bubble after every turn with token usage and think latency
- **Poke the standee**: springy squish, bubble-wrap "pop", wallet balance in its own bubble
- **Chat wallpaper** with a theme-aware veil so text stays readable
- **Liquid glass** composer; messages stay plain text over the wallpaper
- **One switch** in Settings › General to enable or disable the whole look

## Install

### A. One command (recommended)

```powershell
dsh plugin add dsh-xiaod-pet
```

Or in DSH: **Settings → Plugins → Add plugin** and enter `dsh-xiaod-pet`, then restart DSH.

### B. From GitHub

```
https://github.com/use3346631993/dsh-xiaod-pet.git
```

### C. Manual (offline)

1. Copy the repository into your DSH profile's `node_modules`:

   ```powershell
   git clone https://github.com/<you>/dsh-xiaod-pet.git C:\Users\you\Documents\dsh-xiaod-pet
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-xiaod-pet"
   Copy-Item "C:\Users\you\Documents\dsh-xiaod-pet\*" "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-xiaod-pet" -Recurse -Force
   ```

2. Add the plugin to `%USERPROFILE%\.dsh\profiles\desktop\package.json`:

   ```json
   {
     "dsh": { "profile": { "bundles": ["dsh-xiaod-pet"] } },
     "dependencies": { "dsh-xiaod-pet": "file:C:/Users/you/Documents/dsh-xiaod-pet" }
   }
   ```

   (Keep your existing bundles and dependencies — see `examples/profile.package.json`.)

3. Fully quit and restart DeepSeek Harness.

## Usage

- Drag the pet anywhere; the position persists.
- Click the pet to cycle expressions; it returns to its calm face on its own.
- Click the corner standee: squish, pop, balance bubble.
- Toggle the whole outfit in **Settings › General › “D老师” Theme**.

## Development

```powershell
npm run check
npm test
```

The tests run without a browser: fake DOM, fake React, a virtual clock and a fake
Cordis context drive the real handlers and host logic.

## License

- Code: MIT — see `LICENSE`
- Character artwork: provided by the author, **not** covered by MIT — see `NOTICE`
