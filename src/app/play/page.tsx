import { permanentRedirect } from "next/navigation";

// The kid login now lives on /login under the "Young Hero" toggle. Keep /play as
// a permanent redirect so existing links and QR codes (which may carry ?code=)
// still land on the right place.
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const params = new URLSearchParams({ mode: "kid" });
  if (code) params.set("code", code);
  permanentRedirect(`/login?${params.toString()}`);
}
