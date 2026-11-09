# Playability and replay value: assessment and ten ideas

9 November 2026. Scope: how the game plays today, what would bring a young player back, and ten
ways to make it more fun and replayable without borrowing from gambling. Nothing in the game was
changed for this. A separate page presents the same ten ideas for a ten-year-old to judge.

Status, later the same day: the judge rated them and chose three top picks. Ideas 3 (Race your
best), 8 (Room of the day) and 9 (Build your own room) are built, along with the judge's own idea
of a bar at the top holding their options. See `docs/changes-2026-11-07.md`.

## Verdict

The core is good and should stay exactly this simple: one verb (move), one constraint (the
battery), one target (par). What is thin is everything around the core. There are about three
minutes of content at par pace, one kind of goal, an expensive way to fail, and a reward loop that
ends at 18 stars. The remedy is not more systems. It is better feedback and forgiveness in the
moment, more reasons to replay the six rooms, and a source of new rooms, ideally made by the
player.

## The game today, in numbers

Measured by running the par solver (`computeParRoute`) for each room with a stock vacuum. The last
column assumes a key held down the whole way, at 120 ms a move.

| Room | Tiles | Par | Moves per charge | Par per tile | Par run |
|---|---|---|---|---|---|
| 1 Living Room | 169 | 203 | 100 | 1.20 | 24 s |
| 2 Bedroom | 162 | 190 | 100 | 1.17 | 23 s |
| 3 Kitchen | 155 | 169 | 100 | 1.09 | 20 s |
| 4 Office | 148 | 326 | 50 | 2.20 | 39 s |
| 5 Warehouse | 132 | 326 | 50 | 2.47 | 39 s |
| 6 The Gauntlet | 119 | 262 | 33 | 2.20 | 31 s |

The reward loop: finishing a room is one star, finishing within 25% of par is two, at or under par
is three. Each new star is one upgrade point. There are 18 stars. Buying every upgrade costs 29
points.

## What works

1. **It is readable in seconds.** Move, tiles come clean, the battery drains, the dock refills it.
   No tutorial is needed.
2. **The battery is a real decision.** When to turn back is the heart of the game, and the "Dock: N
   moves" readout with its warning makes that decision fair.
3. **Par can be beaten.** The par route is a greedy nearest-tile route, not an optimum, so a
   thoughtful player can beat it by a wide margin. That feels clever, and it is the best feeling
   the game has.
4. **Rooms are short.** A room is one or two minutes, which suits "one more go".
5. **There are no dark patterns.** No timers, no purchases, no nagging. Keep it that way.
6. **It looks far better than it needs to.** Presentation is now well ahead of the play.

## What holds it back

1. **There is very little of it.** A perfect run of all six rooms is 176 seconds of driving. A
   first playthrough is perhaps ten to twenty minutes (an estimate, not measured).
2. **There is one kind of goal.** Stars, score and bonus all measure the same thing: fewer moves.
   The score adds nothing, because tile points are fixed per room, and the best score is saved but
   never shown.
3. **The difficulty has a cliff at room 4.** Par per tile jumps from about 1.1 to about 2.2. In
   rooms 1 to 3 the player mows a lawn and decisions are rare. In rooms 4 to 6 more than half of
   all moves are trips to and from the dock, and the game becomes planning sorties. That is the
   interesting game, but it arrives abruptly and unexplained.
4. **Failing is expensive.** Running out of battery restarts the room. In the Office that can throw
   away 300 moves. There is no undo. This punishes experimenting, which is exactly what the game
   should encourage.
5. **The reward loop closes quickly and runs backwards.** Upgrades only make the game easier. Par
   ignores them (the solver assumes a 100 battery and a stock motor), so an upgraded vacuum earns
   three stars with little effort. After 18 stars there is nothing left to earn, and 11 points'
   worth of upgrades can never be bought.
6. **The only opponent is also the answer key.** G replays the par route at any time.
7. **The 3D view has no job.** It is beautiful and it is harder to plan in. Nothing rewards using
   it.
8. **Nothing changes between visits.** The same six rooms, no surprises, nothing to collect and
   nothing to make.

## What "addictive" should mean for this player

Wanting to come back because of mastery, discovery and making things. Five rules follow from that,
and every idea below was checked against them.

- Every reward has a rule the player can read in advance. No random prizes.
- Skill decides outcomes. Luck does not.
- The game is fine to put down. No streaks that break, no timers, no energy that refills, no
  notifications.
- Sessions end naturally. A room is a minute or two.
- Sharing stays among people the child knows: a link sent to family, never a public leaderboard.

## Ten ideas, simplest first

| # | Idea | What it adds | Main tradeoff | Size |
|---|---|---|---|---|
| 1 | Clean streak | Moment-to-moment reward for a good route | Rewards the same thing par already does | S |
| 2 | Rewind | Forgiveness: a mistake costs a little, not the room | Less tension unless a rewind costs moves | S |
| 3 | Race your best | An opponent that grows with the player | A second vacuum on the board is clutter | S to M |
| 4 | Sticker book | Many kinds of goal in the same rooms | Dull stickers encourage grind | M |
| 5 | Rugs and spare batteries | Real routing choices | More rules; the par solver must learn them | M |
| 6 | Challenge shifts | Four ways to play each room; fixes the star economy | Tuning; Lights Out may frustrate | M |
| 7 | Lost things | A job for the 3D view; discovery | One-time content; 18 small models | M to L |
| 8 | Room of the day | An endless supply of rooms | Generated rooms can be bland; "daily" can nag | L |
| 9 | Build your own room | Creativity, family challenges, endless content | The biggest interface job so far | L |
| 10 | The cat wakes up | Timing and life in a static puzzle | Fairness; the highest risk to simplicity | XL |

### 1. Clean streak

A counter rises with every consecutive move onto a dirty tile, and the cleaning chime climbs in
pitch with it. Driving over an already-clean tile resets it. The results card shows the longest
streak.

- **Why it helps.** It turns the efficiency the scoring already wants into something felt on every
  move, not only at the end. It gives rooms 1 to 3, where decisions are rare, a small goal of
  their own, and it teaches route planning without a word of explanation.
- **Tradeoffs.** It rewards the same skill as par, so it is not a new kind of goal. It can tempt a
  child past the safe turn-back point. Every trip back to the dock breaks it, which may feel
  unfair unless dock trips are exempt. A rising pitch can grate, so it needs a ceiling.
- **Build.** A counter in the move rule, a pitch parameter on one sound, a number in both views.

### 2. Rewind

An undo for the last move, repeatable back to the last dock visit. When the battery dies, the game
offers "Rewind to the dock" instead of ending the room. Each rewind adds a fixed number of moves
to the count, so stars still mean something.

- **Why it helps.** It removes the most punishing moment in the game. Players who can back out of a
  mistake try riskier routes, and risky routes are where the fun and the learning are. It also
  softens the cliff at room 4.
- **Tradeoffs.** Free rewinds would drain the tension from the battery, so the cost needs tuning.
  It interacts with other ideas: a rewound run probably should not earn a "no mistakes" sticker or
  become the personal-best ghost without a mark.
- **Build.** A history stack of small state snapshots.

### 3. Race your best

The game stores the move list of the player's best run in each room and replays it as a faint
ghost while they play, one ghost step per player move. A small readout says how many tiles ahead
or behind they are at the same move number. It can be switched off.

- **Why it helps.** Racing yourself is the strongest healthy reason to replay anything, and it
  keeps working after par is beaten. The par ghost stays as the tutor; this one is the rival.
- **Tradeoffs.** A second vacuum on the board is visual clutter. Runs made with different upgrades
  are not comparable, so the stored run should record them. A best run is at most a few hundred
  moves, so storage is not a concern.
- **Build.** It reuses the ghost renderer in all three views.

### 4. Sticker book

About twenty stickers, each with a rule the player can read before earning it. For example: finish
a room without a single bump, dock with exactly one unit of battery left, beat par by ten, finish
the Night Lab without the flashlight, three-star every room.

- **Why it helps.** It adds many kinds of goal without adding a single room, and it lets different
  players chase different things. It also gives a home to statistics the game already tracks.
- **Tradeoffs.** Stickers of the form "do this a hundred times" turn play into chores, so every
  sticker should ask for a new way of playing, never for more of it. It is another panel and more
  saved state. It works best once ideas 1 to 3 or 6 exist, because stickers amplify variety and do
  not create it.
- **Build.** Rule checks at the end of a room and a grid of stickers.

### 5. Rugs and spare batteries

Two new things on the floor. A rug costs double battery to cross. A spare battery gives a fixed
amount of charge, once per run.

- **Why it helps.** This is a coverage game: every tile must be visited, so the only real choices
  are the order and when to turn back. These two pieces act on exactly those choices. Cross the rug
  or go around it? Take the battery now or keep it for the far corner?
- **Tradeoffs.** More rules to learn. The par solver has to change from a plain breadth-first
  search to a weighted one and has to model pickups, or par stops being trustworthy. The six rooms
  need re-tuning, and both pieces must be drawn in the 2D view and both 3D renderers.
- **Build.** Level data, the move rule, the solver, three renderers.

### 6. Challenge shifts

Finishing a room unlocks three more ways to play it, each with its own row of three stars. Lights
Out: the board shows only cleaned tiles and what the flashlight reaches. Low Battery: start with
60. Driver's Seat: 3D only, with no minimap.

- **Why it helps.** Six rooms become twenty-four challenges with no new rooms to build. Lights Out
  gives the flashlight a purpose and Driver's Seat gives the 3D view one. It also repairs the
  reward loop: 72 stars instead of 18, and shifts can be run on a stock vacuum so upgrades cannot
  trivialise them.
- **Tradeoffs.** Each mode needs its own par and its own tuning. Lights Out could frustrate a
  younger player, so shifts must stay optional and unordered. Four times the stars would make every
  upgrade affordable quickly, so costs or the upgrade list need another look.
- **Build.** A mode flag, per-mode results, a row of stars per mode in the level select.

### 7. Lost things

Each room hides three small objects, such as a sock, a marble or a toy rocket, that can only be
seen from the vacuum's eye: under the sofa, behind a planter. Driving up to one and facing it puts
it on a shelf of eighteen.

- **Why it helps.** It gives the most beautiful part of the game something to do, and discovery is
  a different pleasure from optimisation. It is finite and honest: eighteen things, each in a fixed
  place.
- **Tradeoffs.** It is one-time content. Players on the Classic renderer or a weak GPU need an
  equivalent or they are shut out. Eighteen small models have to be made. Without some hinting it
  becomes pixel hunting.
- **Build.** Placement data, models, a collect rule, a shelf.

### 8. Room of the day

Each day the game generates one new room from the date, the same for everyone. The solver checks
that every tile can be reached and that the battery allows it, computes par, and rejects dull
layouts. Earlier days stay playable.

- **Why it helps.** New rooms without anyone authoring them, and a shared reference point: "did you
  do today's?"
- **Tradeoffs.** Generated rooms are blander than designed ones, so the filter matters more than
  the generator. Daily content is where compulsion usually enters, so this version should have no
  streak counter and no reward for consecutive days, and the archive should always be open.
- **Build.** A seeded generator, validation, a quality filter, a date picker. It shares its level
  plumbing with idea 9.

### 9. Build your own room

An editor on the 15 by 12 grid: place the six kinds of obstacle and the dock, pick one of the six
themes, play it. The game validates the room, computes par with the existing solver, and can
replay the par ghost. A room can be shared as a link that carries the layout, with no server.

- **Why it helps.** Making things is the most durable and the healthiest reason to return to a
  game. It turns the player into the designer, it lets a child set a puzzle for a parent, and it
  supplies rooms forever at no authoring cost. The 3D scene already builds itself from level data.
- **Tradeoffs.** It is the largest interface job so far, and editors are awkward on phones. Shared
  links need a version number so old links keep working. Many player-made rooms will be bad, which
  is fine. The save format needs a slot for custom rooms.
- **Build.** Editor, validation, storage, link encoding.

### 10. The cat wakes up

The cat leaves its bed and walks a path drawn on the floor, one step for every three of the
player's. It blocks the vacuum and leaves paw prints on clean tiles.

- **Why it helps.** It adds timing to a puzzle that is otherwise static, and it makes the room feel
  alive. The cat is already there and already charming.
- **Tradeoffs.** Undoing the player's work is the classic frustration mechanic, so the prints need
  a tight limit. The cat must be fully deterministic or the game starts to turn on luck. Par has to
  be simulated with the cat in the room or set by hand. It needs animation in three renderers. Of
  the ten, it carries the highest risk of making a simple game complicated.
- **Build.** Prototype it in one room before committing to it.

## Suggested order

1. **Ideas 1, 2 and 3 together.** They are small, add no new rules, and fix the two worst
   moment-to-moment problems: flat feedback and costly failure.
2. **Idea 6.** The most replay for the work, and it repairs the star and upgrade economy.
3. **Idea 9, then idea 8 on the same plumbing.** This is the main investment in the game's future.
4. **Idea 4 after idea 6,** when there is enough variety for stickers to point at.
5. **Ideas 5, 7 and 10 by the child's vote.** Prototype 10 in a single room first.

## Not recommended

Random prize boxes or spins. Daily login rewards or streak counters. Lives or energy that refill
with time. Countdown timers on moves. Public leaderboards or chat. Notifications.
