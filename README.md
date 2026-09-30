# Kids Sound Match (web)

The web version of Kids Sound Match V1. A child hears a sound or a word, sees 2–4 pictures and taps the
matching one, in Arabic or English. No ads, no tracking; results stay on the device. It follows
`App v01.md` (the Android spec), adapted for the browser. See [docs/DECISIONS.md](docs/DECISIONS.md)
for every change agreed since.

Packs: Animals (54), Things at home, Vehicles, Musical instruments, Food, Body parts, Family,
**Who eats what?** (see an animal, tap its food), a **Mixed** game of everything, and the parent's own
packs. Parents can also put their own voice and photos into the built-in packs.

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
- A new pack: `public/assets/packs/<id>/manifest.json` plus its files. It's discovered automatically;
  `"order"` sets its place in the list. Items without a `"sound"` play in "Name only" and Explore.
- A "Who eats what?"-style pack: `"kind": "association"` with an `"association"` block (the pack the
  questions are about, the question and "yum" clips), and `"prompts"` on each answer listing the items
  it goes with (see `packs/who-eats-what/manifest.json`). Answers can reuse another pack's files.

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

## My packs (your own pictures and voice)

Home → **My packs** (behind the PIN): create packs like "Family" or "Toys". Each item has a picture
(take a photo, choose one and crop it square, or pick an icon), its name typed in Arabic and/or
English, the name **recorded** in either or both languages (record, then drag two handles to cut
it to the exact word), and optionally a sound. A pack is playable once it has 5 finished items;
items without a sound play in "Name only" mode and Explore. Choose the pack in Settings.

Recording needs the microphone, which browsers only allow on HTTPS or `localhost`; over home
Wi-Fi you can choose a recorded audio file instead.

**Your voice and photos** (in My packs): record any name in the built-in packs in your own voice, plus
the praise lines, or swap a picture for your own photo, like Grandma's photo for "Grandma" in Family.
Anything you don't change keeps the original.

### Optional cloud backup (Google sign-in)

Packs stay on the phone unless a parent signs in with Google in My packs; then they're backed up to
Supabase and appear on the parent's other devices. The child's results are never uploaded. Setup
(once): [docs/CLOUD-SETUP.md](docs/CLOUD-SETUP.md) and [supabase/schema.sql](supabase/schema.sql).

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
