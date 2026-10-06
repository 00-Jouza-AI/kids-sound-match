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

## Added on 1 October 2026

| Feature | Decision |
|---|---|
| Where does it live? | A second association pack: see and hear an animal, then "أين يعيش؟ / أين تعيش؟ / Where does it live?", and tap its home. 9 homes: farm, house, sea, river, jungle, desert, snow, nest, hive. Animals with two homes (duck: farm and river; penguin: sea and snow) never see their other home as a wrong answer; farm/house and sea/river are never shown together. A right answer shows the home behind the animal, which hops |
| Colours, Shapes, Feelings | Starter sets of 6: red, yellow, blue, green, orange, purple; circle, square, triangle, star, heart, moon; happy, sad, angry, scared, sleepy, surprised. Colours are paint splats (never a circle) and the shapes are all one grey-blue, so only the shape differs; both are drawn as final art. Feelings have sounds (laugh, sob, "hmph", gasp, yawn, "wow"); scared and surprised are never shown together. The Arabic feeling words are the usual masculine forms (سعيد), describing the face |
| Counting 1 to 5 | واحد … خمسة. Each number is drawn five ways as final art: dice dots, apples, stars, balloons, fish. A question always uses one kind (3 apples next to 5 apples) |
| Mixed game | Colours, shapes and feelings join the mix, but their questions only show their own kind (no banana next to "yellow", no smiling Mama next to "happy"). Counting stays out |
| Packs without sounds | Packs with fewer than 5 sounds (Food, Body, Family, Colours, Shapes, Counting, a parent's pack of photos) are always played by name; "What your child hears" is hidden for them instead of warning |
| Child profiles | Up to 4 children, each an animal on a colour (no names or photos). Chosen above START on Home; Settings has a Children card (switch, change animal, add, delete). Each child has their own settings, Report, practice and daily play-again count; the PIN, My packs and your voice are shared. The first child keeps everything saved before profiles; deleting a child deletes their results on the phone |
| Share the Report | "Share as a picture" draws one page on the phone (the child's animal, games, answers, first-try %, a bar per pack, what they know well and are still learning) and opens the share menu (WhatsApp, email…); where sharing isn't available, "Save picture". Arabic is drawn right to left |
| Recording studio | Development only, on this PC (Home → Recording studio): every name, sound and line still using a stand-in, filtered by pack and Arabic / English / sounds. Space records (stops by itself after the word), Enter saves and moves on, P plays, R records again. Saves WAV straight into `public/assets` next to the manifest's file (`cat_name_ar.wav` for `cat_name_ar.mp3`; the app accepts either). Accepted only from this computer; a file it replaces is moved to `dev-assets/replaced`, never deleted |
| Cloud backup | Packs keep backing up even if `schema.sql` hasn't been run again since "Your voice and photos"; only that part waits |

### More clips for the voice session (fourth round)

- **64 name recordings** for 32 new pictures: colours (أحمر، أصفر، أزرق، أخضر، برتقالي، بنفسجي), shapes
  (دائرة، مربع، مثلث، نجمة، قلب، هلال), feelings (سعيد، حزين، غاضب، خائف، نعسان، متفاجئ), numbers
  (واحد، اثنان، ثلاثة، أربعة، خمسة) and homes (مزرعة، بيت، بحر، نهر، غابة، صحراء، ثلج، عش، خلية).
- **6 feeling sounds**: laugh, sob, "hmph", gasp, yawn, "wow".
- **3 lines**: `home_question_ar.mp3` أين يعيش؟, `home_question_ar_f.mp3` أين تعيش؟, `home_question_en.mp3` "Where does it live?".
- The studio (`Home → Recording studio` on this PC) is the quickest way to record all of these.

## Added on 2 October 2026

| Feature | Decision |
|---|---|
| Real pictures | Every built-in picture is a Microsoft Fluent Emoji "Color" drawing (MIT licence, credited in About, licence in `public/assets/licenses/`), downloaded with your approval: crisp at any size and the same on every phone. No emoji fitted dates, a beehive, a vacuum cleaner or an oud, so those four were drawn for the app in the same style |
| Your old photos | The 23 cat, dog and duck photos left the built-in pack (copies kept on this PC in `dev-assets/removed-photos`, not in git) and the photo helper (`npm run photos`) was retired: one consistent look. Your own photos still go in through "Your voice and photos" |
| Photos vs drawings | A question shows photos only when every picture in it is a photo (a parent's photo of Grandma falls back to the pack's drawing otherwise), then drawings, then development stand-ins |
| Memory | Pairs face down; turning a card says its sound and name; a found pair stays open with confetti; two different cards turn back after 1.3 s. No score or timer. Starts at 3 pairs; after 3 finished games with every pair found in at most two turns per pair, Home suggests 4, then 6 (behind the PIN; also in Settings). Uses the chosen pack's pictures |
| Odd one out | "أين المختلف؟ / Which one is different?" with 3 or 4 pictures (always at least 3). Easy: different packs (three animals and a car). After 3 finished easy games at 80%+ first try it moves to harder: groups inside a pack (three farm animals and a fish; three fruits and a vegetable); two hard games under 50% move it back. Groups overlap (a duck is a farm animal and a bird), so the odd one is checked against every group the others share: every question has one clear answer |
| Animal babies | A third question pack: see and hear a mother, "أين صغيره؟ / أين صغيرها؟ / Where is its baby?", tap the baby, who appears beside her. 10 babies: عِجل calf, حَمَل lamb, جَدي kid, مُهر foal, جَرو puppy, هُرَيرة kitten, كتكوت chick, شِبل lion cub, حُوار baby camel, فرخ البط duckling. Lamb/kid and calf/baby camel are never asked together. Real baby photos come from the studio's "Find real sounds and photos" once you approve them; until then the pack uses emoji in development and is hidden in release builds |
| Sticker album | After each finished game the child gets a sticker of a picture they found and don't have yet; it pops up on the end screen and flies into a book. The book (next to play again) opens the album: a page per pack, found stickers in colour, the rest as faint shapes; tapping one plays it. Per child, on this phone. (The V1 spec avoided rewards; you chose to add this one.) |
| Print flashcards | Home → Print flashcards: any pack, 4, 6 or 9 cards per A4 page with dashed cut lines, the picture with its Arabic and English names (names can be switched off). On a phone the print screen can save a PDF |
| Real sounds | The studio's "Find real sounds and photos" lists Pixabay candidates (free for apps, no credit needed) for every sound still on a tone: you listen, choose, trim and save; each file's source goes in `public/assets/licenses/sources.csv`. Nothing is downloaded until you choose it |

## Added on 2 October 2026 (second round)

Chosen for a 1.5-year-old (the main player): games she can play now, and a word list for her parents.

| Feature | Decision |
|---|---|
| First words | A new pack, second in the list: ball كرة, teddy دبدوب, balloon بالون, bubbles فقاعات, book كتاب, shoe حذاء, socks جوارب, hat قبعة, cup كوب, spoon ملعقة, bottle رضّاعة, bed سرير, chair كرسي, bath حمّام. Names only. 14 Fluent pictures (MIT), downloaded with your approval. Ball and balloon are never asked together |
| Peekaboo | For the youngest: a blue spotted blanket hides a picture of the chosen pack while its sound plays (every 4 s); one tap anywhere pulls it off: "بَخ!" / "Peekaboo!", the name, the sound again. The next tap brings the blanket back over the next picture. 10 pictures a game (the questions setting), a sticker at the end, nothing to get wrong. Things without a sound stay quiet under a wiggling blanket |
| Find it in the picture | Two scenes, drawn for the app and fitted to any screen: a farm (sky, tree, barn door, fence, field, pond) and a doll's house (bedroom, bathroom, kitchen, living room, with First words, Things at home and Family). "Where's the cow?" (its sound, then its name). It shows 2 more things than the picture setting (4-6), one area at a time so they spread out, each where it belongs (the duck in the pond), never two look-alikes (sheep and goat; clock and alarm clock). Tapping something else makes it hop and say what it is, then the question comes again; after 8 s or two other taps, the right one wiggles. The scenes take turns. "Sound only" leaves out things without a sound |
| Where's your nose? | "Find it at home" became body parts only: a big picture and "أين أنفُكِ؟" (asked up to 3 times, 6 s apart); she points at her own nose and you tap the big green tick (or skip). Tapping the picture asks again. 11 parts: eyes, nose, mouth, ears, hands, finger, arm, feet, leg, teeth, tongue (not face or heart) |
| Girl or boy | Each child's profile can say girl or boy, used only for Arabic grammar (أنفُكِ / أنفُكَ). Asked once, the first time Where's your nose? is played in Arabic; changeable in Settings → Children → Edit child. Kept on this phone, never backed up |
| Words I know | Home → Words I know (and a card in the Report), per child. A word counts as understood after 3 first-try rights on at least 2 different days; a miss takes one right away (so lucky guesses with 2 pictures don't add up); a hint without a wrong tap counts neither way; once known it stays. Counted from the matching game (not Toddler mode), Find it in the picture and Where's your nose? (your tick); not from Memory, Odd one out, Peekaboo or the association packs. Parents mark the words she says ("Says it?") and add words outside the app ("ماء", "bye-bye"). Share as a picture (her animal, the counts, up to 24 words) or print 9 to an A4 page with a title card. On this phone only |
| Real sounds, chosen for you | You asked me to fill the gaps myself: 82 Pixabay sound effects chosen from the studio's candidates (shorter single calls first), each cut to its loudest 3 s (vehicles 3.5 s, instruments 4 s) and saved as 22 kHz WAV through the studio, plus a seal (sea lions in Santa Cruz) and a language-neutral "mmm" for yum instead of the English "yummy". Every sound in the app is now real; all sources are in `public/assets/licenses/sources.csv`. Swap any you dislike in the studio (the old file is kept in `dev-assets/replaced`) |
| Baby photos, chosen for you | 10 Pixabay photos, one clear baby each, cropped square (720 px): calf, lamb, kid, foal, puppy, kitten, lion cub, a new baby camel (the earlier options were a crowded herd or black-and-white) and duckling, plus a real chick so the whole pack is photos |
| Soft "try again" tone | The spec's muted marimba note (0.35 s), made for the app instead of a Pixabay pop |
| The 8 sounds from your Drive | Confirmed on Pixabay: "Free for use under the Pixabay Content License" (cat, dog, frog, monkey, bear, sheep, tiger, duck); listed in sources.csv |
| "Name only" games | Now start with every picture, the quiet animals included; the "real sounds first" default only applies when sounds are played |
| Full screen | Some in-app browsers never answer a full-screen request; the game now starts anyway after 1.5 s |

### More clips for the voice session (sixth round)

- `feedback/peekaboo_ar.mp3` **بَخ!**, `feedback/peekaboo_en.mp3` **Peekaboo!**
- `packs/body/<part>_point_ar_f.mp3` for a girl: أين عيناكِ؟، أين أنفُكِ؟، أين فمُكِ؟، أين أُذُناكِ؟، أين يداكِ؟، أين إصبعُكِ؟، أين ذراعُكِ؟، أين قدماكِ؟، أين رِجلُكِ؟، أين أسنانُكِ؟، أين لسانُكِ؟ (11)
- `packs/body/<part>_point_en.mp3`: Where are your eyes? / nose / mouth / ears / hands / finger / arm / feet / leg / teeth / tongue (11)
- `packs/body/<part>_point_ar_m.mp3` for a boy (أين أنفُكَ؟...): only needed if a boy plays; the studio lists them once a child is a boy
- First words names: 14 in Arabic and 14 in English
- The studio lists all of these, and "Your voice and photos" lets you record them on your phone

## Added on 6 October 2026

| Feature | Decision |
|---|---|
| Hold time | Settings → Leaving a game: hold the corner circle 3, 5, 7 or 10 seconds (3 by default); the ring fills over that time. For the whole phone, like the PIN |
| Picture lock | Settings → Leaving a game → "Then ask for": PIN or 4 pictures. With pictures, leaving a game shows 9 big pictures (cat, dog, frog, apple, banana, car, ball, rocket, star); you tap your 4 in order. No delete key: after the 4th tap it checks and clears itself, so a wrong try just starts again. 3 wrong tries start the PIN's 30-second wait (they share the count). "Use the PIN" is always there. The code is stored salted and hashed like the PIN. Settings, the Report and My packs still ask for the PIN |
| Faster right answers | A right answer gets a second of confetti, no words (changed on 7 October: no name either), then the next question. Toddler mode too. The praise ("رائع!") is said once at the end of the game, before "انتهينا! برافو!", and the play-again screen comes after about 2 s instead of up to 6. Same in Find it in the picture and Where's your nose?; a Memory pair says its name |
| End screen | A much bigger play-again button in the middle, the sticker album bottom left, and a small "choose" button bottom right: pick the game, the pack and one of its groups (Farm, Wild, Birds, Fruit...), then Play. No lock (nothing else can be changed there); groups with fewer than 5 pictures are greyed out; the choice is saved for that child and counts as one of the day's play-agains. Only offered while play-agains are left |
| Pictures per question | 2, 3, 4, 5, 6, 7, 8 or 10 (as asked; 9 was left out). 5 to 10 are laid out 2 across when the phone is upright and in two rows when it's sideways. A small pack shows as many different pictures as it can. Odd one out stays at 3 or 4. "Ready for more?" still only suggests up to 4 |
| Names on the pictures | Every card shows its English name in the top left corner and its Arabic name in the bottom right, sized to the card (on by default; Settings → Names on the pictures). Matching game, Explore, Memory (face up), Peekaboo (once the blanket is off) and Where's your nose?. Not in the scenes, where things are small |

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
- The 8 downloaded sounds are confirmed Pixabay files (Pixabay Content License), listed in `public/assets/licenses/sources.csv`.

## Notes for later

- Photos only show when every picture on the screen has one (the rule above), including a parent's own
  photos. For Family, add photos to everyone you use, or turn the others off in Settings.

- With 3 or 4 pictures on a phone held upright, each picture is ~150 px (about 7% of the screen) because two share the width. Stacking 3 vertically would give ~225 px; the spec's 2 + 1 layout is kept for now.
- Emoji pictures depend on the phone's emoji font. The donkey (a 2022 emoji) is dropped automatically on phones that can't draw it.
- A release build (`npm run build`) shows "Nothing to play yet" until real pictures and name recordings exist, as the spec requires.
- The 23 photos from `Test-1` (cat, dog, duck) may be from the web. Confirm you're allowed to use them before publishing or releasing; the Dress and Glasses photos were skipped (no such animals).
