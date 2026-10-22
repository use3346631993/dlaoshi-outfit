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

1. Copy the repository into your DSH profile's `node_modules`:

   ```powershell
   git clone https://github.com/<you>/dlaoshi-outfit.git C:\Users\you\Documents\dlaoshi-outfit
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@local\dsh-fatfish-outfit"
   Copy-Item "C:\Users\you\Documents\dlaoshi-outfit\*" "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@local\dsh-fatfish-outfit" -Recurse -Force
   ```

2. Add the plugin to `%USERPROFILE%\.dsh\profiles\desktop\package.json`:

   ```json
   {
     "dsh": { "profile": { "bundles": ["@local/dsh-fatfish-outfit"] } },
     "dependencies": { "@local/dsh-fatfish-outfit": "file:C:/Users/you/Documents/dlaoshi-outfit" }
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
