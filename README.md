# Kids Sound Match (web)

The web version of Kids Sound Match V1. A child hears an animal sound, sees 2–4 pictures and taps the
matching animal, in Arabic or English. No ads, no tracking, no accounts; results stay on the device.
It follows `App v01.md` (the Android spec), adapted for the browser. See [docs/DECISIONS.md](docs/DECISIONS.md)
for every change agreed before the build.

## Run it

```bash
npm install
npm run dev
```

- On this PC: http://localhost:5173
- On your phone (same Wi-Fi): http://192.168.1.25:5173 (the address Vite prints as "Network"). The
  first time, Windows may ask to allow Node.js through the firewall; allow it on private networks.
  Over plain Wi-Fi http, the phone won't keep the screen awake or work offline; everything else works.

The first run asks you to set a 4-digit parent PIN. To leave Kid Mode, press and hold the small circle
in the top corner for 3 seconds, then enter the PIN.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server (placeholders on) reachable from your phone |
| `npm test` | Unit tests: engine (all spec 4.4 tests), content validation, audio leveling, PIN, report, telemetry |
| `npm run build` | Release build + release gate (fails on placeholders, trackers, open CSP, unlisted dependencies) |
| `npm run build:test` | A hostable test build that keeps the placeholders |
| `npm run preview` | Serve the last build locally |
| `npm run placeholders` | Regenerate development placeholders |
| `npm run photos -- "<folder>"` | Shrink photos and add them to the animals (see below) |
| `npm run deploy:login` / `deploy:setup` / `deploy` | Put the test build online with Cloudflare Pages (see below) |

## Adding the real content

Drop files into `public/assets/` using the names in the manifest; a real file always replaces its
placeholder, no code changes needed.

- Pictures: `public/assets/packs/animals/cat.webp` (any of webp/png/jpg works if the manifest says so)
- Several pictures of one animal: use `"images": ["animals/cat_1.webp", "animals/cat_2.webp"]` in
  the manifest; one is picked at random each time
- Sounds: `public/assets/packs/animals/cat_sound.mp3`, names `cat_name_ar.mp3` / `cat_name_en.mp3`
- Praise and end-of-game clips: `public/assets/feedback/correct_ar_1.mp3` etc.
- A new pack: `public/assets/packs/<id>/manifest.json` plus its files. It's discovered automatically.

Until real files exist, development builds use emoji pictures, tones, and the device's own voice
(on-device voices only). Release builds refuse to show anything that isn't real.

### Photos

```bash
npm run photos -- "G:/path/to/photos"
```

Name the files after the animal (`cat-1.jpg`, `Cat 2.jpeg`, `duck_3.png`). The helper shrinks each
photo to 720 px (1–15 MB becomes ~50–100 KB), fixes phone rotation, saves it in
`public/assets/packs/animals/photos/`, and lists it under that animal's `"images"` in the manifest.
Running it again replaces that animal's photos; files that aren't an animal are skipped. A question
only shows photos when every picture in it has one, so photos and emoji never share a screen.

## Put it on your phone as a real app (Cloudflare Pages)

Over home Wi-Fi a phone can't install the app, keep the screen on or work offline; over HTTPS it can.

1. Create a free account at dash.cloudflare.com (once).
2. `npm run deploy:login` opens the browser; approve access (once per PC).
3. `npm run deploy:setup` creates the site `kids-sound-match` (once).
4. `npm run deploy` builds the test version and uploads it. Run it again after every change.

The site is `https://kids-sound-match.pages.dev` (or a similar name if that one is taken). Anyone with
the link can open it. On the phone, open it and choose "Add to Home screen" / "Install app".

## Settings from the environment

Put these in `.env.local` (not committed):

- `VITE_TELEMETRY_URL`: anonymous telemetry endpoint. Empty (default): telemetry doesn't exist, the
  toggle is hidden, zero network requests.
- `VITE_PARENTS_GROUP_URL`: the WhatsApp group link. Empty: the "Join Parents Group" link is hidden.

## Layout

`src/` mirrors the Android package layout so the port is mostly a translation:
`engine/` (pure TypeScript game logic, no browser code) · `content/` (manifest loader + validation) ·
`audio/` · `settings/` · `report/` · `telemetry/` · `lock/` (PIN, gate, fullscreen) ·
`ui/parent/` · `ui/kid/` · `ui/theme/`. Build tooling is in `tools/`.
