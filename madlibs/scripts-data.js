// Script library for the Blanks! prototype.
// Blank types: noun, verb, adjective, adverb, plural noun, exclamation.
// Body tokens: {0}..{n} = blank index, {from} = requester's name, {to} = filler's name.
const SCRIPT_LIBRARY = [
    {
        id: "roast-day",
        theme: "Roast a friend",
        title: "A Day in Their Life",
        blanks: [
            { t: "verb", hint: "an action — run, sneeze, yodel" },
            { t: "adjective", hint: "a describing word — slimy, majestic" },
            { t: "noun", hint: "a thing — potato, trombone" },
            { t: "exclamation", hint: "something you shout — yikes, hooray" },
            { t: "adverb", hint: "how it's done — loudly, gracefully" }
        ],
        body: [
            "At 7 a.m., {to} woke up and immediately started to {0}.",
            "They looked in the mirror, saw a {1} {2}, and screamed.",
            "“{3}!” yelled {to}, {4}.",
            "Honestly, {from} is not even surprised anymore."
        ]
    },
    {
        id: "fake-news",
        theme: "Fake news report",
        title: "Breaking News",
        blanks: [
            { t: "adjective", hint: "a describing word — enormous, sparkly" },
            { t: "noun", hint: "a thing — walrus, vending machine" },
            { t: "verb", hint: "an action — dance, escape" },
            { t: "adverb", hint: "how it's done — furiously, politely" },
            { t: "adjective", hint: "another describing word" }
        ],
        body: [
            "BREAKING: A {0} {1} was spotted downtown this morning.",
            "Witnesses say it tried to {2} {3} before officials arrived.",
            "“In all my years, I have never seen anything this {4},” said local reporter {to}.",
            "More on this story as it develops."
        ]
    },
    {
        id: "love-letter",
        theme: "Love letter",
        title: "My Dearest",
        blanks: [
            { t: "adjective", hint: "a describing word — glowing, crusty" },
            { t: "noun", hint: "a thing — sunset, garbage truck" },
            { t: "verb", hint: "an action — laugh, stomp" },
            { t: "adverb", hint: "how it's done — wildly, gently" },
            { t: "noun", hint: "another thing — hamster, cactus" }
        ],
        body: [
            "My dearest {to},",
            "Your eyes shine like a {0} {1}.",
            "Every time you {2}, my heart beats {3}.",
            "Forever yours, {from} (and my beloved pet {4})."
        ]
    },
    {
        id: "job-interview",
        theme: "Job interview",
        title: "The Interview",
        blanks: [
            { t: "verb", hint: "an action — juggle, negotiate" },
            { t: "adverb", hint: "how it's done — flawlessly, suspiciously" },
            { t: "adjective", hint: "a describing word — humble, shiny" },
            { t: "noun", hint: "a thing — photocopier, bear" },
            { t: "exclamation", hint: "something you shout — huzzah, oops" }
        ],
        body: [
            "Interviewer: What is your greatest strength?",
            "{to}: I can {0} {1}.",
            "Interviewer: And your greatest weakness?",
            "{to}: Sometimes I am simply too {2}.",
            "Interviewer: Why should we hire you?",
            "{to}: I once fought a {3} and won.",
            "They got the job on the spot. {4}!"
        ]
    },
    {
        id: "fantasy-quest",
        theme: "Fantasy quest",
        title: "The Legendary Quest",
        blanks: [
            { t: "adjective", hint: "a describing word — brave, moist" },
            { t: "noun", hint: "a treasure — chalice, stapler" },
            { t: "plural noun", hint: "more than one thing — spoons, geese" },
            { t: "verb", hint: "an action — crawl, moonwalk" },
            { t: "adverb", hint: "how it's done — heroically, immediately" }
        ],
        body: [
            "Sir {to} the {0} set out to find the legendary {1}.",
            "Armed with nothing but {2}, they had to {3} across the Valley of Doom.",
            "When they finally faced the dragon, it surrendered {4}.",
            "The kingdom cheered. {from} wrote a ballad about it."
        ]
    },
    {
        id: "group-chat",
        theme: "Group chat drama",
        title: "The Group Chat",
        blanks: [
            { t: "adjective", hint: "a describing word — cursed, dazzling" },
            { t: "noun", hint: "a thing — sandwich, minivan" },
            { t: "verb", hint: "an action — post, wiggle" },
            { t: "adverb", hint: "how it's done — dramatically, sneakily" }
        ],
        body: [
            "{from}: did you SEE what {to} posted??",
            "{to}: it was just a photo of my {0} {1} 😤",
            "{from}: you cannot just {2} like that in public",
            "{to}: watch me do it again, but more {3} 💅"
        ]
    },
    {
        id: "sports-cast",
        theme: "Sports commentary",
        title: "Play-by-Play",
        blanks: [
            { t: "noun", hint: "a thing — ball, burrito" },
            { t: "adverb", hint: "how it's done — blazingly, cautiously" },
            { t: "adjective", hint: "a describing word — slippery, invisible" },
            { t: "noun", hint: "another thing — cone, flamingo" },
            { t: "verb", hint: "an action — slide, cartwheel" }
        ],
        body: [
            "Welcome back, folks — {to} has the {0} and is moving {1} down the field!",
            "Oh no — they trip over a {2} {3}!",
            "Unbelievable! They recover and {4} straight into the goal!",
            "The crowd goes absolutely wild. {from} is in tears."
        ]
    },
    {
        id: "campfire",
        theme: "Horror story",
        title: "The Campfire Tale",
        blanks: [
            { t: "adjective", hint: "a describing word — foggy, sticky" },
            { t: "verb", hint: "an action — whisper, tap-dance" },
            { t: "adjective", hint: "another describing word" },
            { t: "noun", hint: "a thing — clown, toaster" },
            { t: "adverb", hint: "how it's done — bravely, squeakily" },
            { t: "plural noun", hint: "more than one thing — socks, batteries" }
        ],
        body: [
            "It was a {0} night when {to} heard something {1} in the basement.",
            "Slowly, the door creaked open… revealing a {2} {3}.",
            "{to} screamed {4} — but the thing just wanted to borrow some {5}.",
            "It still visits every Tuesday. {from} sets a third plate at dinner."
        ]
    }
];
