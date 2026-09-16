# The blind answer pass

Spec §6.5.2. Three files live here per pool, and this is what each is for.

| File | Written by | What it is |
|---|---|---|
| `<poolId>.blind.md` | the extractor, then the reviewer | every question with its four choices and **no key**, plus two lines per item for the reviewer to fill in |
| `<poolId>.resolved.json` | a person | what was decided about every flag the comparison raised |
| — | — | the pool itself stays in `src/content/drills/<poolId>.json` and is never edited from here |

Math items are generated, so a verifier recomputes the answer and two derivations agreeing is
evidence. These items are authored: a person typed the question, the answer and the three wrong
answers, and there is nothing to recompute. The validator checks the *shape* of an item. This
pass is the only check in the program that sees what an item **means** — whether the marked
answer is the right one, whether a second option is also defensible, whether the question can
be answered at all.

## Running it over a pool you have just written

```bash
# 1. Cut the sheet. It has no answer key in it.
npx tsx src/lib/content/blind-pass-cli.ts extract <poolId>

# 2. Someone who has NOT read src/content/drills/<poolId>.json answers every question in
#    src/content/review/<poolId>.blind.md, filling in both lines under each item:
#      Answer: B
#      Also defensible: none
#    A person, or a subagent handed the sheet and nothing else. If you wrote the pool, you
#    are not eligible to answer the sheet.

# 3. Compare. Exits non-zero while anything is outstanding.
npx tsx src/lib/content/blind-pass-cli.ts compare <poolId>

# 4. Settle every flag (below), then re-run step 3 until it prints PASS.
npx vitest run src/lib/content/blind-pass.test.ts
```

The test suite runs step 3 over **every sheet in this directory**, so an unsettled flag fails
`npm test`, not just the command above.

## What gets flagged

- **disagreement** — the reviewer picked something other than the key.
- **ambiguity** — the reviewer agreed with the key and named another option that is also
  defensible. This is as much a defect as a wrong key, and it is the one a reader glides past
  when they are only hunting for mistakes. That is why the sheet asks on every single item.
- **unanswerable** — the reviewer wrote `?`: none of the four is right, or the question cannot
  be answered from what the child is shown.

Also failing: any item nobody answered, any answer given before the question was edited, and
any answer for an item the pool does not have. Silence is not agreement.

## Settling a flag

**A disagreement is not automatically a content bug.** The reviewer can be wrong, and saying so
is a legitimate outcome — but it has to be said in writing, or the same item is argued about
again on every run. Add an entry to `<poolId>.resolved.json`:

```json
{
  "poolId": "science-g3",
  "resolutions": [
    {
      "itemId": "sci-g3-food-chain",
      "code": "9667b6",
      "keyAt": "The grass",
      "verdict": "reviewer-was-wrong",
      "note": "A producer starts the chain; the reviewer read the arrow backwards.",
      "resolvedBy": "kylee",
      "resolvedAt": "2026-09-16"
    }
  ]
}
```

`code` is the `#code` printed beside the question on the sheet; `keyAt` is the item's answer as
it stood when this was settled. Both are checked, so a settlement covers **that question with
that key** and nothing else. Edit the item or move the key and the flag comes back — which is
right: a rewritten question has never been blind-checked.

The four verdicts are defined on the `Resolution` type in `src/lib/content/blind-pass.ts`:
`key-was-wrong`, `reviewer-was-wrong`, `item-rewritten`, `ambiguity-accepted`.
