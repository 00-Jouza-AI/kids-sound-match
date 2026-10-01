# Kids Sound Match (web)

The web version of Kids Sound Match V1. A child hears a sound or a word, sees 2–4 pictures and taps the
matching one, in Arabic or English. No ads, no tracking; results stay on the device. It follows
`App v01.md` (the Android spec), adapted for the browser. See [docs/DECISIONS.md](docs/DECISIONS.md)
for every change agreed since.

Packs: Animals (54), Things at home, Vehicles, Musical instruments, Food, Body parts, Family, Colours,
Shapes, Feelings, Counting 1 to 5, **Who eats what?** (see an animal, tap its food), **Where does it
live?** (tap its home), a **Mixed** game, and the parent's own packs. Parents can also put their own
voice and photos into the built-in packs. Brothers and sisters each get a profile (an animal on a
colour) with their own settings and Report, and the Report can be shared as a picture.

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
| `npm run deploy:login` / `deploy:setup` / `deploy` | Put the test build online with Cloudflare Pages (see below) |

## Adding the real content

Drop files into `public/assets/` using the names in the manifest; a real file always replaces its
placeholder, no code changes needed.

- Pictures: every built-in picture is a real drawing now: Microsoft Fluent Emoji (MIT licence, see
  `public/assets/licenses/`), plus colours, shapes, counting, dates, beehive, vacuum cleaner and oud
  drawn for this app. To change one, replace `public/assets/packs/animals/cat.svg` (any of
  svg/webp/png/jpg works if the manifest says so)
- Several pictures of one item: use `"images": ["counting/count_3_dots.svg", ...]` in the manifest;
  one is picked at random each time (all items in a question use the same one when they have the same
  number, as in Counting)
- Sounds: `public/assets/packs/animals/cat_sound.mp3`, names `cat_name_ar.mp3` / `cat_name_en.mp3`
- Praise and end-of-game clips: `public/assets/feedback/correct_ar_1.mp3` etc.
- A new pack: `public/assets/packs/<id>/manifest.json` plus its files. It's discovered automatically;
  `"order"` sets its place in the list. Items without a `"sound"` play in "Name only" and Explore.
- A "Who eats what?"-style pack: `"kind": "association"` with an `"association"` block (the pack the
  questions are about, the question and "yum" clips), and `"prompts"` on each answer listing the items
  it goes with (see `packs/who-eats-what/manifest.json`). Answers can reuse another pack's files.

Until real files exist, development builds use emoji pictures, tones, and the device's own voice
(on-device voices only). Release builds refuse to show anything that isn't real.

### Recording studio (the fastest way to add real voices)

Run `npm run dev`, open http://localhost:5173 on this PC, then Home → **Recording studio** (behind the
PIN). It lists every name, sound and line that still uses the stand-in voice. Pick a pack and Arabic /
English / Sounds, press **Space** to record (it stops by itself after the word), check the trim, and
press **Enter**: the clip is saved straight into `public/assets` with the right name and the next one
comes up. **P** plays, **R** records again, **← →** move between clips. Sounds can be loaded from a file
instead. Recordings are WAV (`cat_name_ar.wav` stands in for `cat_name_ar.mp3`; the app accepts both).
Anything a recording replaces is moved to `dev-assets/replaced`, never deleted. Reload the app to hear
the new clips. The studio only exists on the development server and only accepts this computer.

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
