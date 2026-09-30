# Decisions and changes from the V1 spec

Agreed on 29 September 2026, before the build. The Android build should carry these forward.

## Your decisions

| Topic | Decision |
|---|---|
| Stack | React + TypeScript + Vite; Vitest for tests. Runtime dependencies: react, react-dom only |
| Phone testing | Dev server on this PC, opened from the phone over home Wi-Fi |
| Pictures until real art | Emoji art for all 24 animals (development only) |
| Review style | Build everything; verify each checkpoint myself |
| Voice until recordings | The device's own text-to-speech, on-device voices only; tones if a language has no voice |
| Gendered Arabic praise | Gender-neutral lines: جميل! replaces أحسنت, session end becomes انتهينا! برافو! |
| Arabic words | MSA as scripted, but goat is عنزة (singular), not ماعز (collective) |
| Confusable pairs | Added bear ↔ lion and bear ↔ tiger |
| Toddler mode | Tapping any animal plays that animal's own sound and name, then praise, then moves on |
| Right tap | The animal's name, then praise |
| Wrong tap | Soft tone, picture fades, the target sound replays straight away |
| 2 pictures in portrait | Stacked top/bottom (~31–35% of the screen each instead of ~12%); side by side in landscape |
| Animal picker | "Animals" in Settings with presets (All, With real sounds, and the manifest's groups); animals without a real sound are off by default; minimum 5 |
| Forgot PIN | Type a number written in words (e.g. ثلاثمئة وثمانية وأربعون), then set a new PIN; the report is kept |
| Several pictures per animal | Supported: `"images": [...]` in the manifest, one picked at random each time |
| Arabic app name | Keep "Kids Sound Match" in both languages |

## Added on 30 September 2026

| Feature | How it works |
|---|---|
| Name-only questions | Third "What your child hears" option. The question is only the word ("Where's the cat?"). Items may now have no `sound`; they only appear in this mode, which opens the way for Clothes, Food and Family packs |
| Adaptive practice | On by default (Settings switch). When a game starts, each animal's last 10 tries in the Report set how often it's asked: first-try rate under 60% (2+ tries) = twice per round; 90%+ (4+ tries) = every other round. Toddler games are ignored |
| Gentle hints | On by default (Settings switch). The right picture wiggles after 8 s without a tap (again every 8 s), or straight after two wrong taps. Hinted answers are saved as not-first-try and marked "with a hint" in the Report. Never in Toddler mode |
| Both languages | Third game-language option: every name in Arabic, then English. Praise is picked from both languages; the end-of-game line plays in both |
| Explore mode | Second button on Home. All chosen animals, 6 per page with arrow buttons; tap one to hear its sound and name. No questions, nothing recorded. Same lock and exit as the game |
| Ready for more? | When the last 3 finished games at the current number of pictures reach 80% first try, Home suggests one more picture. Accepting goes through the PIN; "Not now" waits for 3 more games |
| Photo helper | `npm run photos`: shrinks photos with Windows' built-in imaging and adds them as `images`. Photos and emoji never share a question or an Explore page |
| Real app on the phone | Cloudflare Pages (private code, free HTTPS). `npm run deploy` uploads the test build (emoji and device voice included) so the phone can install it, keep the screen on and work offline |

## Fixes applied by default

1. Feedback paths (`feedback/...`) resolve from the assets root, matching spec 3.1; item paths resolve from `packs/`. `asset_root` is ignored because the item paths already include the pack folder.
2. A wrong tap stops the repeating sound before the soft tone, so nothing overlaps.
3. The celebration waits for the name and praise to finish (at least 1.2 s), so it never cuts a clip off or overlaps the next question.
4. Taps are ignored for 0.5 s after a question appears, so a finger still tapping can't skip it.
5. Targets come from a shuffle bag: every enabled animal is asked once before any repeats, never twice in a row.
6. If confusable pairs make a full question impossible (small packs), the game shows fewer pictures instead of failing; validation warns.
7. The report shows "1 of 5" style counts and hides percentages until an animal has 3 tries. Animals are listed hardest first.
8. Every clip is volume-levelled, trimmed of silence, and animal sounds are capped at 3 s with a fade. Your downloaded sounds have not been through the -16 LUFS step yet (the frog clip is about 4 s).

## Web versions of Android-only features

| Spec | Web version |
|---|---|
| Screen pinning | Fullscreen, Back button swallowed, screen kept awake, long-press/selection/zoom blocked, plus a one-time note on the phone's own lock (Android App pinning, iPhone Guided Access). A web page can't fully lock a phone; the first-run copy says so. |
| Silent / volume check | Browsers can't read the volume. A sound check plays a real animal sound; the parent confirms or gets tips. Once per visit. |
| Folder scan for packs | `assets/packs/index.json`, generated by the build (served live in development) |
| Room, DataStore, WorkManager | IndexedDB, localStorage; telemetry uploads when the app is opened (no background jobs on the web) |
| AD_ID removal, SDK allowlist | A Content-Security-Policy that blocks every other server, and a release gate that fails the build on placeholders, tracker domains or unlisted dependencies |
| Process death | The game is saved after every question; a reload returns to the same question behind a big play button |
| Offline | A service worker caches everything (HTTPS or localhost only) |

## Changes to make in the voice recording script (PDF) before the session

- Total clips is **60**, not 59 (24 + 24 + 10 + 2). The checklist mentions both.
- `correct_ar_1.mp3`: **جميل!** instead of أحسنت!
- `session_end_ar.mp3`: **انتهينا! برافو!** instead of أحسنت! لقد أنهيت اللعبة
- `goat_name_ar.mp3`: **عنزة** (ʿanza) instead of ماعز
- Worth a listen during the 8-of-10 adult test: camel (unfamiliar groan), owl vs pigeon, mouse vs bird. Add confusable pairs if they fail.
- The 8 downloaded sounds look like Pixabay files; confirm the licence covers commercial use before release.

## Notes for later

- With 3 or 4 pictures on a phone held upright, each picture is ~150 px (about 7% of the screen) because two share the width. Stacking 3 vertically would give ~225 px; the spec's 2 + 1 layout is kept for now.
- Emoji pictures depend on the phone's emoji font. The donkey (a 2022 emoji) is dropped automatically on phones that can't draw it.
- A release build (`npm run build`) shows "Nothing to play yet" until real pictures and name recordings exist, as the spec requires.
- The 23 photos from `Test-1` (cat, dog, duck) may be from the web. Confirm you're allowed to use them before publishing or releasing; the Dress and Glasses photos were skipped (no such animals).
