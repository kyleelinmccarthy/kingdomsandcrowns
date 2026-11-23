import Image from "next/image";
import { GameIcon } from "@/components/game-icon";
import { REALM_SHOWCASE } from "@/components/marketing/realm-showcase-data";
import { FRAME } from "@/components/marketing/styles";
import type { Screenshot } from "@/components/marketing/screens";

function Shot({ shot, sizes }: { shot: Screenshot; sizes: string }) {
  return (
    <div className={`relative aspect-[16/10] bg-[#0a1020] ${FRAME}`}>
      <Image src={shot.src} alt={shot.alt} fill sizes={sizes} className="object-cover" />
    </div>
  );
}

/**
 * The landing page's showcase of the Realm, the 3D game. Static: all copy and
 * screenshots come from REALM_SHOWCASE, so editing that file is all a copy or
 * screenshot change needs.
 */
export function RealmShowcase() {
  const { eyebrow, title, subtitle, points, shots } = REALM_SHOWCASE;
  const [large, ...small] = shots;

  return (
    <section
      id="realm"
      aria-labelledby="realm-title"
      className="border-y border-gold-dim/30 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(124,58,237,0.10)_0%,transparent_70%)] py-14"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-wider text-[var(--gold-bright)] uppercase">{eyebrow}</p>
          <h2 id="realm-title" className="page-title mt-2 text-3xl sm:text-4xl">
            {title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{subtitle}</p>
        </div>

        <div className="mt-8 space-y-4">
          <Shot shot={large} sizes="(min-width: 1024px) 976px, 100vw" />
          <div className="grid gap-4 sm:grid-cols-2">
            {small.map((shot) => (
              <Shot key={shot.src} shot={shot} sizes="(min-width: 1024px) 480px, (min-width: 640px) 50vw, 100vw" />
            ))}
          </div>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p.title} className="flex gap-4 rounded-lg border border-gold-dim bg-muted/20 p-5">
              <GameIcon
                name={p.icon}
                className="size-8 shrink-0 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]"
              />
              <div>
                <h3 className="text-base font-medium">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
