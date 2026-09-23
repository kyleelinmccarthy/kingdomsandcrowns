import { redirect } from "next/navigation";
import { queryString, type Query } from "@/lib/realm3d/overrides";

/**
 * The old address of the 3D Realm, from when it was a spike beside the flat one. `/realm` is
 * the 3D game now, so this only forwards there — query and all, so every screenshot override
 * (`?outfit=`, `?viewer=parent`, `?castle=0`, `?name=`, `?close`) and `?child=` still land on
 * the same picture.
 */
export default async function Realm3dPage({ searchParams }: { searchParams: Promise<Query> }) {
  redirect(`/realm${queryString(await searchParams)}`);
}
