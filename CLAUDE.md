# Notes for Claude Code sessions in this repo

## Publishing (changed 11 November 2026)

- The game is live at **https://vacuum.badweasley.com**, served by the Cloudflare Worker `badweasley-vacuum`.
- **Do not publish to Netlify.** `robot-vacuum-game.netlify.app` is the old address. It is frozen and Netlify is being cancelled. Do not renew its token and do not run the old upload modes of `scripts/publish-netlify.mjs`; they now refuse to run.
- **To publish:** commit, then `npm run deploy`. It runs the tests, then builds, deploys and verifies from `~/code/badweasley` (the same as running `npm run deploy:vacuum` and `npm run verify` there).
- `npm run deploy:check` lists what would ship and touches no network. What ships is still chosen by `scripts/publish-netlify.mjs --stage`; the file keeps its old name only for that.
- The live site answers with an `X-Build` header naming the commit that is published.
- **Nothing may cost money.** Everything under badweasley.com is on Cloudflare's free plans: no Workers Paid, no R2, no paid add-on. Do not edit DNS by hand and do not touch any other Worker.
- wrangler is already signed in on this Mac. Do not log in or out, and do not create API tokens.
- The full picture for every badweasley.com site is in `~/code/badweasley/PUBLISHING.md`.
