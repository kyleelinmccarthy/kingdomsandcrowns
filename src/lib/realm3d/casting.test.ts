import { describe, expect, it } from "vitest";
import { resolveSpell, type SpellDefinition } from "@/lib/utils/spell-catalog";
import {
  cooldownLeft,
  cooldownMsFor,
  digitSlot,
  makeCaster,
  makeCastQueue,
  manaFraction,
  MANA_MAX,
  MANA_REGEN_PER_S,
  pushCast,
  REFUSAL_MS,
  shakingSlot,
  slotReady,
  stepCaster,
  tryCast,
} from "./casting";

/** The starter spell every child in the app owns: an Ember Bolt, 10 mana, 300ms cast. */
const bolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null }) as SpellDefinition;
/** An expensive one, for the "big spells feel big" claim. */
const sprite = resolveSpell({ elementId: "storm", formId: "sprite", modifierId: null }) as SpellDefinition;

describe("the numbers come from the spell, not from a literal", () => {
  it("rests a cheap spell briefly and an expensive one for a beat", () => {
    expect(cooldownMsFor(bolt)).toBe(900);
    expect(cooldownMsFor(sprite)).toBe(1700);
    expect(cooldownMsFor(bolt)).toBeLessThan(cooldownMsFor(sprite));
  });

  it("never lets a key machine-gun and never feels broken", () => {
    const cheap = { ...bolt, manaCost: 0 };
    const dear = { ...bolt, manaCost: 500 };
    expect(cooldownMsFor(cheap)).toBe(500);
    expect(cooldownMsFor(dear)).toBe(2500);
  });
});

describe("mana", () => {
  it("starts full", () => {
    expect(makeCaster(4).mana).toBe(MANA_MAX);
    expect(manaFraction(makeCaster(4))).toBe(1);
  });

  it("is spent by a cast, at the spell's own cost", () => {
    const c = makeCaster(4);
    tryCast(c, 1, bolt);
    expect(c.mana).toBe(MANA_MAX - bolt.manaCost);
  });

  it("comes back over time, at the flat Realm's own rate", () => {
    const c = makeCaster(4);
    tryCast(c, 1, bolt);
    stepCaster(c, 1);
    expect(c.mana).toBeCloseTo(MANA_MAX - bolt.manaCost + MANA_REGEN_PER_S);
  });

  it("never overfills", () => {
    const c = makeCaster(4);
    stepCaster(c, 1000);
    expect(c.mana).toBe(MANA_MAX);
  });

  it("refuses a cast it cannot pay for, and says so", () => {
    const c = makeCaster(4);
    c.mana = 4;
    expect(tryCast(c, 1, bolt)).toBeNull();
    expect(c.refusal).toBe("mana");
    expect(c.mana).toBe(4);
  });
});

describe("cooldowns", () => {
  it("makes the second press of the same key wait", () => {
    const c = makeCaster(4);
    expect(tryCast(c, 1, bolt)).toBe(bolt);
    expect(tryCast(c, 1, bolt)).toBeNull();
    expect(c.refusal).toBe("cooldown");
  });

  it("lets the same key go again once its rest is over", () => {
    const c = makeCaster(4);
    tryCast(c, 1, bolt);
    stepCaster(c, cooldownMsFor(bolt) / 1000 + 0.001);
    expect(tryCast(c, 1, bolt)).toBe(bolt);
  });

  it("never blocks a DIFFERENT key: four keys are four keys", () => {
    const c = makeCaster(4);
    expect(tryCast(c, 1, bolt)).toBe(bolt);
    expect(tryCast(c, 2, bolt)).toBe(bolt);
    expect(tryCast(c, 3, bolt)).toBe(bolt);
    expect(c.mana).toBe(MANA_MAX - bolt.manaCost * 3);
  });

  it("reports the rest as a fraction a wipe can be drawn from", () => {
    const c = makeCaster(4);
    expect(cooldownLeft(c, 1)).toBe(0);
    tryCast(c, 1, bolt);
    expect(cooldownLeft(c, 1)).toBeCloseTo(1);
    stepCaster(c, cooldownMsFor(bolt) / 2000);
    expect(cooldownLeft(c, 1)).toBeCloseTo(0.5);
    stepCaster(c, 10);
    expect(cooldownLeft(c, 1)).toBe(0);
    expect(slotReady(c, 1)).toBe(true);
  });

  it("answers for a slot that does not exist without throwing", () => {
    const c = makeCaster(4);
    expect(cooldownLeft(c, 9)).toBe(0);
    expect(tryCast(c, 9, bolt)).toBeNull();
    expect(tryCast(c, 0, bolt)).toBeNull();
  });

  /**
   * Order matters and is argued for in the module: a child hammering a key they cannot afford
   * must be told about the COST, so the wait must not get in first and mask it.
   */
  it("blames the cost, not the wait, when both are true", () => {
    const c = makeCaster(4);
    c.mana = 4;
    tryCast(c, 1, bolt);
    expect(c.refusal).toBe("mana");
  });
});

describe("the shake that answers a refused press", () => {
  it("points at the slot that refused, and only for a moment", () => {
    const c = makeCaster(4);
    c.mana = 0;
    tryCast(c, 3, bolt);
    expect(shakingSlot(c)).toBe(3);
    stepCaster(c, REFUSAL_MS / 1000 + 0.01);
    expect(shakingSlot(c)).toBe(0);
  });

  it("says nothing at all when the last press worked", () => {
    const c = makeCaster(4);
    tryCast(c, 1, bolt);
    expect(shakingSlot(c)).toBe(0);
  });
});

describe("the clock is handed in, never read from the machine", () => {
  it("gives the same answers for the same presses and the same dts", () => {
    const run = () => {
      const c = makeCaster(4);
      for (let i = 0; i < 40; i++) {
        stepCaster(c, 1 / 60);
        tryCast(c, 1, bolt);
      }
      return [c.mana, c.clock, c.readyAt[0]];
    };
    expect(run()).toEqual(run());
  });
});

describe("the key queue", () => {
  it("reads the number row and nothing else", () => {
    expect(digitSlot("Digit1")).toBe(1);
    expect(digitSlot("Digit9")).toBe(9);
    expect(digitSlot("Digit0")).toBe(0);
    expect(digitSlot("KeyW")).toBe(0);
    expect(digitSlot("Space")).toBe(0);
  });

  it("holds the presses a frame has not seen yet", () => {
    const q = makeCastQueue();
    pushCast(q, 1);
    pushCast(q, 2);
    expect(q.n).toBe(2);
    expect(q.slots.slice(0, 2)).toEqual([1, 2]);
  });

  it("drops the overflow rather than growing, so a leaned-on key allocates nothing", () => {
    const q = makeCastQueue();
    const before = q.slots.length;
    for (let i = 0; i < 50; i++) pushCast(q, 1);
    expect(q.n).toBe(before);
    expect(q.slots.length).toBe(before);
  });
});
