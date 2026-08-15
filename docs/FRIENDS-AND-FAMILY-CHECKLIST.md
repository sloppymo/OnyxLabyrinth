# Friends & Family Playtest 1 checklist

## Before sending the URL

- [ ] Review and accept `playtest/friends-and-family-1`.
- [ ] Run `npm run check` on the exact final commit.
- [ ] Publish that exact commit through the existing GitHub Pages workflow.
- [ ] Confirm the workflow is green.
- [ ] Open the public URL in a fresh/private browser profile.
- [ ] Confirm the title shows `FRIENDS & FAMILY PLAYTEST 1` and the expected
      short SHA.
- [ ] Start a fresh game without developer tools.
- [ ] Enter Floor 1 and complete one fight.
- [ ] Save, refresh, and Continue.
- [ ] Confirm no important console errors, failed sprites, fonts, or audio.
- [ ] Confirm the intended endpoint is Floor 5's boss and wish ending.

## URL to send

```text
https://sloppymo.github.io/OnyxLabyrinth/
```

Do not send this URL for the new playtest until it displays the accepted
candidate SHA. The URL currently follows `main`, not local branches.

## Useful tester warning

This is a desktop-keyboard playtest. The dungeon HUD shows the important keys;
the full campaign ends after the Floor 5 boss. Ask testers to include the short
build SHA from the title screen with bug reports.

## Feedback worth asking for

1. Did you ever feel lost for the wrong reason?
2. Where did combat first become boring, unfair, or too slow?
3. Could you tell why an enemy combination was dangerous before it hit you?
4. Did knowing which enemy to target noticeably help?
5. Did combat barks make characters feel distinct, or become repetitive?
6. Which class actions did you ignore, and why?
7. Which dungeon room or encounter was most memorable?
8. Did recovery feel fair after a difficult fight or wipe?
9. Did anything look unfinished, fail to load, or stop responding?
10. At what point did you naturally want to stop playing?

If someone becomes stuck, ask for the build SHA, floor, approximate position,
what they did immediately before the failure, and whether Continue reproduces
it. Do not ask friends to run a developer QA spreadsheet.
