/**
 * SPIKE — throwaway. A second, parallel view of the same village in real 3D, to answer one
 * question by being looked at. `/realm` is untouched and is still the game.
 *
 * Deliberately outside the (app) group: no sidebar, no page banner, no HUD. Full bleed, so the
 * only thing being judged is the picture.
 */

import { Realm3dSpike } from "@/components/realm3d/spike-shell";

export const metadata = { title: "Realm 3D — spike" };

export default function Realm3dPage() {
  return <Realm3dSpike />;
}
