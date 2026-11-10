// === THE REST OF THE HOUSE ===
// Rooms 7 to 30, drawn as maps so a layout can be read and edited at a glance.
// core.js holds the first six rooms in the long-hand form; this file appends the rest
// in the same form and then counts the house.
//
// Every map is 15 wide and 12 tall:
//   .  floor              D  the dock
//   #  wall               c  chair          p  plant
//   S  sofa, three in a row or three in a column
//   T  table, a 2 by 2 block
//   B  pet bed, two side by side or two in a column
//
// The house is five floors of six rooms. A room takes its look from its place on the
// floor (scene3d.js cycles its six themes), and each floor ends on a harder room.

const FLOOR_SIZE = 6;
const FLOOR_NAMES = ['Ground floor', 'Upstairs', 'The annex', 'The works', 'The tower'];

const LEVEL_MAPS = [
    // ----- floor 2 -----
    { // 7
        name: 'Den', batteryCost: 1,
        map: [
            'D......SSS....p',
            '...............',
            '..TT.......c...',
            '..TT...........',
            '.......##......',
            '.......##...TT.',
            'p...........TT.',
            '....c..........',
            '..........BB...',
            '.SSS...........',
            '.......c......p',
            'p..............',
        ],
    },
    { // 8
        name: 'Playroom', batteryCost: 2,
        map: [
            'p....c.....c..p',
            '..BB......TT...',
            '..........TT...',
            '.c...SSS.......',
            '............c..',
            '...TT....#.....',
            '...TT....#...BB',
            '.........#.....',
            '.c....c........',
            '....S.......c..',
            'p...S....c.....',
            '....S..D......p',
        ],
    },
    { // 9
        name: 'Diner', batteryCost: 2,
        map: [
            'p.............p',
            '.#########.....',
            '...............',
            '.cTTc..cTTc....',
            '..TT....TT.....',
            '...............',
            '...............',
            '.cTTc..cTTc....',
            '..TT....TT.....',
            '...............',
            '.#########....D',
            '.....SSS......p',
        ],
    },
    { // 10
        name: 'Control Room', batteryCost: 2,
        map: [
            'p......#......p',
            '.TT.TT.#.TT.TT.',
            '.TT.TT.#.TT.TT.',
            '.c...c...c...c.',
            '...............',
            '...D...#.......',
            '.......#.......',
            '.......#.......',
            '.c...c...c...c.',
            '.TT.TT.#.TT.TT.',
            '.TT.TT.#.TT.TT.',
            'p......#......p',
        ],
    },
    { // 11
        name: 'Loading Dock', batteryCost: 2,
        map: [
            'D..............',
            '.##.##...##.##.',
            '.##.##...##.##.',
            '...............',
            '.##.##.#.##.##.',
            '.##.##.#.##.##.',
            '...............',
            '.##.##...##.##.',
            '.##.##...##.##.',
            '...............',
            '..SSS.....BB...',
            'p.............p',
        ],
    },
    { // 12
        name: 'Night Shift', batteryCost: 3,
        map: [
            'p.............p',
            '.####.###.####.',
            '......#........',
            '.##.#.#.#####..',
            '....#...#......',
            '.####.D.#.####.',
            '....#...#......',
            '..#####.#.#.##.',
            '...............',
            '.####.###.####.',
            '...............',
            'p.............p',
        ],
    },

    // ----- floor 3 -----
    { // 13
        name: 'Sun Room', batteryCost: 2,
        map: [
            'p.....SSS.....p',
            '...............',
            '..c.........c..',
            '....#######....',
            'D...#.....#....',
            '.S..#.TT..#..S.',
            '.S....TT.....S.',
            '.S..#.....#..S.',
            '....#######....',
            '..c.........c..',
            '...............',
            'p....BB.......p',
        ],
    },
    { // 14
        name: 'Bunk Room', batteryCost: 2,
        map: [
            'p....S....S...p',
            'D....S....S....',
            '..c..S....S..c.',
            '...............',
            '.BB....TT....BB',
            '.......TT......',
            '...............',
            '..c..S....S..c.',
            '.....S....S....',
            'p....S....S....',
            '........c......',
            '...#########..p',
        ],
    },
    { // 15
        name: 'Pantry', batteryCost: 2,
        map: [
            '...............',
            '.############..',
            '...............',
            '..############.',
            '...............',
            '.....TT........',
            '.....TT...c....',
            '...............',
            '..############.',
            'D..............',
            '.############..',
            '.....SSS.......',
        ],
    },
    { // 16
        name: 'Library', batteryCost: 3,
        map: [
            'p.............p',
            '.#.#.#...#.#.#.',
            '.#.#.#...#.#.#.',
            '.#.#.#.c.#.#.#.',
            '.#.#.#...#.#.#.',
            '.......D.......',
            '......TT.......',
            '.#.#.#TT.#.#.#.',
            '.#.#.#...#.#.#.',
            '.#.#.#...#.#.#.',
            '...............',
            'SSS.........BB.',
        ],
    },
    { // 17
        name: 'Hangar', batteryCost: 3,
        map: [
            'p......#......p',
            '..##...#...##..',
            '..##.......##..',
            '...............',
            '.###...c...###.',
            '...............',
            '......D........',
            '...............',
            '.###...c...###.',
            '...............',
            '..##.......##..',
            '..##...#...##..',
        ],
    },
    { // 18
        name: 'The Labyrinth', batteryCost: 3,
        map: [
            '...............',
            '.#####.#.#####.',
            '.#....D......#.',
            '.#.###.#.###.#.',
            '.#.#.......#.#.',
            '...#.......#...',
            '.#.#.......#.#.',
            '.#.###.#.###.#.',
            '.#...........#.',
            '.#####.#.#####.',
            '...............',
            'p.............p',
        ],
    },

    // ----- floor 4 -----
    { // 19
        name: 'Parlour', batteryCost: 2,
        map: [
            'p...#.........p',
            '....#..SSS.....',
            '....#..........',
            '.......#####...',
            '..TT...#.......',
            'D.TT...#..c....',
            '.......#.......',
            '...#####..TT...',
            '..........TT...',
            '.....SSS..#....',
            '..........#....',
            'p.........#...p',
        ],
    },
    { // 20
        name: 'Toy Store', batteryCost: 3,
        map: [
            '..c.........c..',
            '.##..##.##..##.',
            '...............',
            '.##..##.##..##.',
            '....c.....c....',
            '..BB.......BB..',
            '.......D.......',
            '....c.....c....',
            '.##..##.##..##.',
            '...............',
            '.##..##.##..##.',
            '..c.........c..',
        ],
    },
    { // 21
        name: 'Cafeteria', batteryCost: 3,
        map: [
            'p.............p',
            '.TTc.TTc.TTc...',
            '.TT..TT..TT....',
            '...............',
            '.cTT.cTT.cTT...',
            '..TT..TT..TT...',
            '.........D..##.',
            '.TTc.TTc.TTc##.',
            '.TT..TT..TT....',
            '...............',
            '.#######.......',
            'p.............p',
        ],
    },
    { // 22
        name: 'Newsroom', batteryCost: 3,
        map: [
            'p......c......p',
            '.##.##...##.##.',
            '.#...#...#...#.',
            '...............',
            '.#...#...#...#.',
            '.##.##.D.##.##.',
            '...............',
            '.##.##...##.##.',
            '.#...#...#...#.',
            '...............',
            '.#...#...#...#.',
            '.##.##.c.##.##.',
        ],
    },
    { // 23
        name: 'Depot', batteryCost: 3,
        map: [
            '...............',
            '.######.######.',
            '...............',
            '.###.#####.###.',
            '...............',
            '.#####D..#####.',
            '...............',
            '.###.#####.###.',
            '...............',
            '.######.######.',
            '...............',
            'p.....SSS.....p',
        ],
    },
    { // 24
        name: 'Blackout', batteryCost: 3,
        map: [
            '..#.#.....#.#..',
            '..#.#.....#.#..',
            '..#.........#..',
            '..#..#####..#..',
            '....#..D..#....',
            '..#.........#..',
            '....#.....#....',
            '..#..#####..#..',
            '..#.........#..',
            '..#.#.....#.#..',
            '..#.#.....#.#..',
            '..#.#.....#.#..',
        ],
    },

    // ----- floor 5 -----
    { // 25
        name: 'Penthouse', batteryCost: 3,
        map: [
            'p.............p',
            '...............',
            '.SSS.......SSS.',
            '...............',
            '####.#####.####',
            '......D........',
            '..TT.......TT..',
            '..TT...c...TT..',
            '...............',
            '####.#####.####',
            '......BB.......',
            'p.............p',
        ],
    },
    { // 26
        name: 'Nursery Wing', batteryCost: 3,
        map: [
            'p....S........p',
            '.BB..S....TT...',
            '.....S..c.TT...',
            '..c............',
            '......####.....',
            '.........#..BB.',
            '.........#.....',
            '......####...c.',
            '..c...D........',
            '.....S..c.TT...',
            '.BB..S....TT...',
            'p....S........p',
        ],
    },
    { // 27
        name: 'Banquet Hall', batteryCost: 3,
        map: [
            '...............',
            '.c.c.c...c.c.c.',
            '.TTTTTT.TTTTTT.',
            '.TTTTTT.TTTTTT.',
            '.c.c.c...c.c.c.',
            '....D..........',
            '...............',
            '.c.c.c...c.c.c.',
            '.TTTTTT.TTTTTT.',
            '.TTTTTT.TTTTTT.',
            '.c.c.c...c.c.c.',
            '...............',
        ],
    },
    { // 28
        name: 'War Room', batteryCost: 3,
        map: [
            'p......#......p',
            '.TT....#....TT.',
            '.TT.........TT.',
            '....###.###....',
            '....#...D.#....',
            '.c..#.....#..c.',
            '....#..TT.#....',
            '.c.....TT....c.',
            '....#.....#....',
            '....#######....',
            '.TT.........TT.',
            '.TT....#....TT.',
        ],
    },
    { // 29
        name: 'Cargo Bay', batteryCost: 3,
        map: [
            '....#.....#....',
            '....#.....#....',
            '.####.....####.',
            '...............',
            '.##.###.###.##.',
            '....#..D..#....',
            '.##.###.###.##.',
            '...............',
            '.####.....####.',
            '....#.....#....',
            '....#.....#....',
            '....#.....#....',
        ],
    },
    { // 30
        name: 'The Last Speck', batteryCost: 4,
        map: [
            '...#.......#...',
            '...#.......#...',
            '...#.#####.#...',
            '...............',
            '.####.#.#.####.',
            '......#D#......',
            '.####.#.#.####.',
            '...............',
            '...#.#####.#...',
            '...#.......#...',
            '...#.......#...',
            'p..#.......#..p',
        ],
    },
];

// Turn a map into the { name, batteryCost, charger, obstacles } form the game plays.
function levelFromMap(def) {
    const rows = def.map;
    if (rows.length !== ROWS || rows.some((r) => r.length !== COLS)) throw new Error(`${def.name}: a map must be ${COLS} by ${ROWS}`);
    const at = (c, r) => (r >= 0 && r < ROWS && c >= 0 && c < COLS ? rows[r][c] : '');
    const used = rows.map(() => new Array(COLS).fill(false));
    const take = (type, c, r, w, h, ch) => {
        for (let dr = 0; dr < h; dr++) {
            for (let dc = 0; dc < w; dc++) {
                if (at(c + dc, r + dr) !== ch || used[r + dr][c + dc]) throw new Error(`${def.name}: the ${type} at ${c},${r} is not a whole ${w} by ${h} piece`);
                used[r + dr][c + dc] = true;
            }
        }
        return { type, col: c, row: r, w, h };
    };
    const obstacles = [];
    let charger = null;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (used[r][c]) continue;
            const ch = rows[r][c];
            if (ch === '.') continue;
            if (ch === 'D') {
                if (charger) throw new Error(`${def.name}: two docks`);
                charger = { col: c, row: r };
            } else if (ch === '#') obstacles.push(take('wall', c, r, 1, 1, ch));
            else if (ch === 'c') obstacles.push(take('chair', c, r, 1, 1, ch));
            else if (ch === 'p') obstacles.push(take('plant', c, r, 1, 1, ch));
            else if (ch === 'T') obstacles.push(take('table', c, r, 2, 2, ch));
            else if (ch === 'S') obstacles.push(at(c + 1, r) === 'S' && !used[r][c + 1] ? take('couch', c, r, 3, 1, ch) : take('couch', c, r, 1, 3, ch));
            else if (ch === 'B') obstacles.push(at(c + 1, r) === 'B' && !used[r][c + 1] ? take('petbed', c, r, 2, 1, ch) : take('petbed', c, r, 1, 2, ch));
            else throw new Error(`${def.name}: "${ch}" at ${c},${r} is not a map letter`);
        }
    }
    if (!charger) throw new Error(`${def.name}: no dock`);
    return { name: def.name, batteryCost: def.batteryCost, charger, obstacles };
}

for (const def of LEVEL_MAPS) LEVELS.push(levelFromMap(def));

// The house is these rooms. One more slot after them holds whichever extra room is loaded
// (the room of the day, or one the player built); see rooms.js.
const HOUSE_LEVELS = LEVELS.length;
const SPECIAL_LEVEL = HOUSE_LEVELS;
