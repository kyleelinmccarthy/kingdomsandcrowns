/**
 * A built site's stars on its villager's nameplate: "★ 7 of 9" at full depth, the marks alone
 * (lit to what is earned) at simple depth, where the programme draws no numerals.
 */
export function PlateStars({ have, max, numerals }: { have: number; max: number; numerals: boolean }) {
  return (
    <span className="r3-plate-stars">
      {numerals
        ? `★ ${have} of ${max}`
        : Array.from({ length: max }, (_, k) => (
            <span key={k} className={k < have ? "r3-plate-star r3-plate-star--on" : "r3-plate-star"}>
              ★
            </span>
          ))}
    </span>
  );
}
