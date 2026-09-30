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

## Added on 30 September 2026 (second round)

These override parts of the V1 spec at the owner's request: rule 6 ("no accounts, no login"), rule 4
("nothing leaves the device" — now true for the child's results, not for parents' own packs if they
sign in), rule 5 (microphone permission) and the V1 out-of-scope list (parent photos, voice
recording, cloud sync). The privacy promise and policy were rewritten to match.

| Feature | Decision |
|---|---|
| 30 more animals | 20 with sounds (chick, turkey, goose, parrot, peacock, eagle, seal, dolphin, whale, fox, zebra, deer, hippo, gorilla, crocodile, cricket, mosquito, bat, penguin, leopard) and 10 quiet ones for Name-only/Explore (rabbit, giraffe, turtle, fish, butterfly, snail, ladybug, ant, kangaroo, panda). No pig or boar. New sound-alike pairs: dog/seal/fox, horse/donkey/zebra, donkey/penguin, duck/goose, lion/tiger/bear/leopard, monkey/gorilla, bird/chick/cricket, bee/mosquito, snake/crocodile, mouse/bat, cat/peacock, dolphin/whale. New groups: Birds, Sea animals, Little creatures |
| Play again | A big ▶ on the end screen starts a new game with the same settings, up to a daily limit set in Settings (Off / 1 / 3 / 5 / no limit; default 3). After that the end screen waits for a parent |
| My packs | Parents create their own packs (5+ finished items to play). Item = square picture (photo from camera/gallery with crop, or an icon) + names + the name recorded in Arabic and/or English (record, then trim with two handles) + optional sound. Stored on the device (IndexedDB) |
| Cloud backup | Supabase, optional: "Sign in with Google" in My packs backs packs up and restores them on other devices (last change wins; deletions sync). Rows and files are private per account (Row Level Security). The app only contacts Supabase after a parent signs in. "Delete my cloud data" removes everything. Custom packs never go into telemetry |
| GitHub | Private repository, published from GitHub Desktop |

### More clips for the voice session

60 more name recordings, same naming as before (`<key>_name_ar.mp3`, `<key>_name_en.mp3`) for:
chick (كتكوت), turkey (ديك رومي), goose (إوزة), parrot (ببغاء), peacock (طاووس), eagle (نسر),
seal (فقمة), dolphin (دلفين), whale (حوت), fox (ثعلب), zebra (حمار وحشي), deer (غزال),
hippo (فرس النهر), gorilla (غوريلا), crocodile (تمساح), cricket (صرصور الليل), mosquito (بعوضة),
bat (خفاش), penguin (بطريق), leopard (فهد), rabbit (أرنب), giraffe (زرافة), turtle (سلحفاة),
fish (سمكة), butterfly (فراشة), snail (حلزون), ladybug (دعسوقة), ant (نملة), kangaroo (كنغر),
panda (باندا). Plus 20 animal sound effects (`<key>_sound.mp3`) for the first 20. Worth checking:
"deer" is named غزال (gazelle), the word most families use.

## Added on 30 September 2026 (third round)

| Feature | Decision |
|---|---|
| New packs | Things at home (15, with sounds), Vehicles (14, with sounds), Musical instruments (11, with sounds), Food (25), Body parts (13) and Family (9). The last three are name-only. Sound-alikes are never asked together: doorbell/phone/alarm clock, tap/shower/frying pan, door/hammer, keys/scissors, ambulance/police car/fire truck, car/bus/truck, plane/helicopter/rocket, train/ship, motorbike/tractor, drum/darbuka, oud/guitar, trumpet/saxophone, piano/accordion, hand/finger/arm, foot/leg, mouth/tongue/teeth, hummus/labneh, tomato/apple, Mama/Aunt, Baba/Uncle |
| Pack order | Manifests have an `order`: Animals, Things at home, Vehicles, Instruments, Food, Body parts, Family, Who eats what?, then Mixed, then your own packs |
| Who eats what? | A new kind of pack (`"kind": "association"`). The child sees and hears an animal (its sound, name, then "What does it eat?") and taps its food; a right answer plays the food's name, a "yum" and praise, and the food is "eaten". 15 foods for 39 animals. An animal that eats several of the foods (the horse: apple, carrot, grass) never sees its other foods as wrong answers. The Arabic question follows the animal's gender (ماذا يأكل؟ / ماذا تأكل؟), taken from a final ة or the manifest's `ar_feminine` (أفعى). Always sound + name + question, whatever "What your child hears" says; no Toddler mode and no Explore for this pack |
| Mixed game | A "Mixed" pack in Settings: every ready pack together, each with the pictures chosen for it; packs can be left out. Wrong answers come from the same side as the right one (built-in packs, or your own packs), so your photos are only asked with each other. A few sound-alikes across packs are kept apart (bell/doorbell/phone/alarm clock, drum/darbuka/door/hammer, trumpet/elephant, snake/frying pan/shower). Not sent in telemetry |
| Your voice and photos | My packs → Your voice and photos: record any name in the built-in packs in your own voice (Arabic and/or English), a sound, the praise lines, the end-of-game line and the Who-eats-what lines, or replace a picture with your own photo (Grandma's photo for "Grandma"). Anything not changed keeps the original; "Use original" undoes it. A file shared by two packs (the carrot in Food and Who eats what?) changes in both. Stored on the device and, when signed in, backed up with the packs (new table `custom_overrides`) |
| Settings | The pack choice is now a grid of pictures at the top; your own packs are marked "yours" |
| Report | "By picture", one section per pack. Mixed-game answers count for the pack each picture came from; Who eats what? counts separately from Food (naming a carrot and knowing who eats it are different skills). Game details show "Rabbit → Carrot" |
| Left out on purpose | "Teacher" (not family) and, in Who eats what?, peanuts and corn (the right answer wasn't clear-cut) |

### More clips for the voice session (third round)

- **190 name recordings** (Arabic + English) for 95 new pictures: the six new packs plus Who eats what?'s own
  foods (grass عشب, bone عظمة, seeds حبوب, bamboo خيزران, leaves أوراق الشجر, flower زهرة, meat لحم, lettuce خس).
- **40 sound effects** for Things at home, Vehicles and Musical instruments (`<key>_sound.mp3`).
- **4 lines**: `eat_question_ar.mp3` ماذا يأكل؟, `eat_question_ar_f.mp3` ماذا تأكل؟,
  `eat_question_en.mp3` "What does it eat?", and `yum.mp3` (a happy "mmm, yum!" or munching sound).
- Worth checking: Family uses the words toddlers say at home (ماما، بابا، تيتا، جدّو، عمّو، خالتو، بيبي), not MSA;
  Uncle and Aunt are one of each (عمّو, خالتو), and families can record their own word in "Your voice and photos".
- Pictures still to draw: dates (the placeholder is a palm tree), labneh and hummus have no emoji of their own.

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

- Photos only show when every picture on the screen has one (the rule above), including a parent's own
  photos. For Family, add photos to everyone you use, or turn the others off in Settings.

- With 3 or 4 pictures on a phone held upright, each picture is ~150 px (about 7% of the screen) because two share the width. Stacking 3 vertically would give ~225 px; the spec's 2 + 1 layout is kept for now.
- Emoji pictures depend on the phone's emoji font. The donkey (a 2022 emoji) is dropped automatically on phones that can't draw it.
- A release build (`npm run build`) shows "Nothing to play yet" until real pictures and name recordings exist, as the spec requires.
- The 23 photos from `Test-1` (cat, dog, duck) may be from the web. Confirm you're allowed to use them before publishing or releasing; the Dress and Glasses photos were skipped (no such animals).
