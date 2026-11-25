# Calendar note pins — verification report

Use the pin icon on any original Daily or All notes card to pin it for the rest of the current week, month, or year. Only the first weekly pin asks whether the week starts on Sunday or Monday. This preference follows the signed-in account; anonymous pins and preferences are kept in the browser. Daily shows active pins after the daily cards. A pinned card is a read-only view of the original note, not a copy, so its content and attachments stay linked. If the same note is pinned for multiple periods, it appears once with each active period listed.

## Screenshots

| Case | Screenshot |
| --- | --- |
| Week/month/year options open next to the clicked pin | [01 — Pin options](screenshots/01-pin-options.png) |
| First weekly pin asks Sunday or Monday in the same anchored dialog | [02 — Week-start selector](screenshots/02-first-week-preference.png) |
| All three periods below the daily notes; yearly note expanded | [03 — Daily with pins](screenshots/03-all-periods-expanded.png) |
| Same workspace on mobile | [04 — Mobile](screenshots/04-mobile-pins.png) |
| Another device reuses the saved week start without showing the selector | [05 — Preference reused](screenshots/05-week-preference-reused.png) |
| Sunday-start week ends on Saturday; month and year remain | [06 — Weekly expiry](screenshots/06-sunday-week-expired.png) |
| July pin is gone on August 1; yearly pin remains | [07 — Monthly expiry](screenshots/07-month-expired.png) |
| 2026 pin is gone on January 1, 2027 | [08 — Yearly expiry](screenshots/08-year-expired.png) |
| Monday-start weekly pin still visible on Sunday | [09 — Monday boundary, before](screenshots/09-monday-week-active-on-sunday.png) |
| Same pin gone on Monday | [10 — Monday boundary, after](screenshots/10-monday-week-expired.png) |
| Anonymous pin survives a reload | [11 — Anonymous reload](screenshots/11-anonymous-pin-reloaded.png) |
| Anonymous pin backed up at sign-in and visible on a second browser | [12 — Sign-in backup](screenshots/12-anonymous-pin-backed-up.png) |
| Older note pinned from All notes | [13 — History](screenshots/13-pin-from-history.png) |
| On a narrow viewport, the dialog opens above a pin near the bottom edge | [14 — Mobile pin options](screenshots/14-mobile-pin-menu.png) |

## HTTP and storage evidence

- [Browser requests and real server response bodies](requests.log) for the first and repeated week-start lookup, each pin write, and Daily loads before and after expiry. `PUT /notes/daily?includePins=true` returns `{ ids, pins }`; requests without the flag still get the legacy ID array. The client sends a date from the browser’s calendar, not a UTC timestamp.
- [Filesystem tree captured from the test server](notes-tree.txt). Each filesystem user already has a private directory under the configured notes root; the paths below are relative to that directory. Azure uses the same paths as blob names under the user prefix.

```text
<user notes directory>/
├── .week-start
└── 2026/
    ├── july.d/
    │   ├── 2026-07-18-july-workspace-2.pin
    │   └── workspaces-2026-07-18/
    │       ├── workspace-1.md
    │       ├── workspace-2.md
    │       └── workspace-3.md
    ├── pinned/
    │   └── 2026-07-18-july-workspace-3.pin
    └── weekly/
        └── 29/
            └── sunday-2026-07-18-july-workspace-1.pin
```

A `.pin` file contains the original note path and the date it was pinned. Expired records stay on disk but are not returned for the current date. Week 1 contains January 1; weeks spanning New Year remain active through the last day of that week. Years with 53 weeks use `weekly/53`.

## Reproduce

```sh
npm run build
PLAYWRIGHT_CHANNEL=chrome npm test
PLAYWRIGHT_CHANNEL=chrome KATAVTI_PIN_EVIDENCE=docs/reports/calendar-pins \
  npx vitest run server/test/e2e/pins-browser.test.ts
```

The production build passed, as did all 87 server tests and 114 client tests. [Build log](build.log) · [Full test log](tests.log) · [Screenshot run](browser-tests.log)

The browser tests use loopback only, synthetic notes, and temporary filesystem storage. Server unit tests cover filesystem and simulated Azure storage, rejected API input, idempotency, account isolation, and cross-year and week-53 boundaries. No live Azure account was used.
