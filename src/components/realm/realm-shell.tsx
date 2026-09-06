"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRealmKingdom, type RealmBundle } from "@/lib/actions/realm";
import { getRealmAccess } from "@/lib/actions/realm-play";
import { buildWorldLayout } from "@/lib/realm/layout";
import { applyDeedResult, type KingdomState } from "@/lib/realm/kingdom-state";
import { renderSettingsFor } from "@/lib/realm/render-settings";
import { VILLAGERS, villagerById } from "@/lib/realm/villagers";
import { gateCopy, type GateCopy } from "@/lib/realm/play-clock";
import { disposeSpriteTextures } from "@/lib/realm/sprite-texture";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { readingAttributes } from "@/lib/utils/learning-profile";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";
import { SpriteSource, type SpriteTextures } from "./sprite-source";
import { RealmHud } from "./realm-hud";
import { RealmGate } from "./realm-gate";
import { RealmClosed } from "./realm-closed";
import { DeedPanel } from "./deed-panel";
import { TouchStick } from "./touch-stick";
import { useRealmInput } from "./use-realm-input";
import { usePlayClock, type CloseReason } from "./use-play-clock";

const VILLAGERS_RESTING = "The villagers are resting. Try again.";

const RealmScene = dynamic(() => import("./realm-scene"), { ssr: false, loading: () => <p className="p-6 text-center text-muted-foreground">Opening the Realm…</p> });

type Phase = { kind: "checking" } | { kind: "gated"; copy: GateCopy } | { kind: "open"; minutes: number; note: string | null } | { kind: "closed"; body: string } | { kind: "unsupported" };

const UNSUPPORTED = "This device can't open the Realm yet. Try a newer browser or another device.";

/** True unless the browser clearly has WebGL support and refuses a context (jsdom has neither, and passes). */
function webglSupported(): boolean {
  if (typeof document === "undefined") return true;
  const hasApi = typeof window.WebGL2RenderingContext !== "undefined" || typeof window.WebGLRenderingContext !== "undefined";
  if (!hasApi) return true;
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
}

export function RealmShell({
  bundle,
  childId,
  isChildView,
  selector,
}: {
  bundle: RealmBundle;
  childId: string;
  isChildView: boolean;
  selector?: React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [isTouch, setIsTouch] = useState(false);

  // The access check is async, so the state updates below are not synchronous effect writes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
      const result = await getRealmAccess(childId, localDateOf(new Date()), currentTimeOfDay());
      if (cancelled) return;
      setIsTouch(touch);
      if (!webglSupported()) {
        setPhase({ kind: "unsupported" });
        return;
      }
      const copy = gateCopy(result);
      if (!isChildView) {
        // Parents look, never spend: the gate becomes an information line.
        setPhase({ kind: "open", minutes: 0, note: copy ? `Closed for ${bundle.heroName}: ${copy.title}` : null });
        return;
      }
      // `copy` is non-null exactly when access is denied.
      if (copy) {
        setPhase({ kind: "gated", copy });
        return;
      }
      setPhase({ kind: "open", minutes: result.allowed ? result.minutesRemaining : 0, note: null });
    })().catch((err: unknown) => {
      if (!cancelled) setPhase({ kind: "gated", copy: { title: "The Realm is out of reach right now.", body: err instanceof Error ? err.message : "Try again in a moment." } });
    });
    return () => {
      cancelled = true;
    };
  }, [childId, isChildView, bundle.heroName]);

  useEffect(() => () => disposeSpriteTextures(), []);

  const onClose = useCallback((reason: CloseReason) => {
    setPhase({ kind: "closed", body: gateCopy({ allowed: false, reason })!.body });
  }, []);

  if (phase.kind === "checking") return <p className="p-6 text-center text-muted-foreground">Checking the gate…</p>;
  if (phase.kind === "unsupported") return <p className="p-6 text-center text-muted-foreground">{UNSUPPORTED}</p>;
  if (phase.kind === "gated") return <RealmGate copy={phase.copy} heroName={bundle.heroName} />;
  if (phase.kind === "closed") return <RealmClosed heroName={bundle.heroName} body={phase.body} />;

  // The open world is its own component so the play clock mounts with the real
  // minute count, not a placeholder from before the access check resolved.
  return (
    <RealmOpen
      bundle={bundle}
      childId={childId}
      isChildView={isChildView}
      isTouch={isTouch}
      minutes={phase.minutes}
      note={phase.note}
      onClose={onClose}
      selector={selector}
    />
  );
}

function RealmOpen({
  bundle,
  childId,
  isChildView,
  isTouch,
  minutes,
  note,
  onClose,
  selector,
}: {
  bundle: RealmBundle;
  childId: string;
  isChildView: boolean;
  isTouch: boolean;
  minutes: number;
  note: string | null;
  onClose: (reason: CloseReason) => void;
  selector?: React.ReactNode;
}) {
  const [textures, setTextures] = useState<SpriteTextures | null>(null);
  const [spriteError, setSpriteError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [kingdom, setKingdom] = useState<KingdomState>(bundle.kingdom);
  const [kingdomError, setKingdomError] = useState(bundle.kingdomError ?? "");
  const [reachId, setReachId] = useState<string | null>(null);
  const [openVillagerId, setOpenVillagerId] = useState<string | null>(null);
  const [risingId, setRisingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // `.game-content` (the page's <main>) is `position: relative; z-index: 10`,
  // which traps `.realm-root`'s z-index inside its own stacking context —
  // the app banner (30) and bottom nav (40) would sit on top of the world
  // no matter how high `.realm-root`'s z-index goes. Portal all the way to
  // `document.body`, which has no z-index of its own (not a stacking
  // context), so `.realm-root { z-index: 45 }` is compared against the
  // banner and nav directly. `.realm-root` no longer sits inside
  // `.game-shell`, so it carries its own `readingAttributes` below instead of
  // relying on that ancestor's scoping. Resolved once, client-side only:
  // this component never renders during SSR (it mounts after the
  // client-side access check resolves).
  const [portalTarget] = useState<Element | null>(() => (typeof document === "undefined" ? null : document.body));
  const layout = useMemo(() => buildWorldLayout({ castleType: bundle.castleType, buildings: kingdom.buildings }), [bundle.castleType, kingdom.buildings]);
  const settings = renderSettingsFor(bundle.profile, isTouch);
  const panelOpen = openVillagerId !== null;
  const { axisRef, setStick } = useRealmInput({ enabled: !panelOpen });
  const config = bundle.avatarConfig ?? DEFAULT_AVATAR;
  const clock = usePlayClock({ enabled: isChildView, childId, initialMinutes: minutes, onClose, paused: panelOpen });
  const onReady = useCallback((t: SpriteTextures) => setTextures(t), []);
  const onError = useCallback((e: Error) => setSpriteError(e.message), []);
  const onReachChange = useCallback((id: string | null) => setReachId(id), []);
  const onTalk = useCallback((id: string) => setOpenVillagerId(id), []);

  // Enter or Space talks to the villager in reach when no panel is open.
  useEffect(() => {
    if (panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!reachId) return;
      const t = e.target;
      if (t instanceof Element && t.closest("a, button, input, textarea, select, [role='dialog']")) return;
      e.preventDefault();
      setOpenVillagerId(reachId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, reachId]);

  // The rise toast clears itself; the timer is the only place that clears it.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // The latest kingdom, readable from event handlers without a stale closure and without side effects in an updater.
  const kingdomRef = useRef(kingdom);
  useEffect(() => {
    kingdomRef.current = kingdom;
  }, [kingdom]);

  const onDeedFinished = useCallback((buildingId: string, result: { done: number; total: number; complete: boolean }) => {
    const applied = applyDeedResult(kingdomRef.current, buildingId, result);
    kingdomRef.current = applied.state;
    setKingdom(applied.state);
    if (applied.rose) {
      const label = applied.state.buildings.find((b) => b.id === buildingId)?.label ?? "building";
      setRisingId(buildingId);
      setToast(`The ${label} stands.`);
    }
    setOpenVillagerId(null);
  }, []);

  const onKingdomRetry = useCallback(() => {
    getRealmKingdom(childId)
      .then((k) => {
        setKingdom(k);
        setKingdomError("");
      })
      .catch(() => setKingdomError(VILLAGERS_RESTING));
  }, [childId]);

  const openVillager = openVillagerId ? villagerById(openVillagerId) : null;
  const openBuilding = openVillager ? kingdom.buildings.find((b) => b.id === openVillager.buildingId) ?? null : null;
  const calm = bundle.profile.reducedMotion || bundle.profile.lowStimulus;

  if (!portalTarget) return null;

  return createPortal(
    <div className="realm-root" {...readingAttributes(bundle.profile)}>
      <SpriteSource key={retryKey} config={config} villagers={VILLAGERS} onReady={onReady} onError={onError} />
      {textures && (
        <RealmScene
          layout={layout}
          textures={textures}
          settings={settings}
          axisRef={axisRef}
          interactive={!panelOpen}
          reachId={reachId}
          onReachChange={onReachChange}
          onTalk={onTalk}
          risingId={risingId}
        />
      )}
      <RealmHud
        heroName={bundle.heroName}
        minutesRemaining={isChildView ? clock.minutesRemaining : null}
        warning={clock.warning}
        preview={isChildView ? null : { note }}
        hudScale={settings.hudScale}
        error={spriteError || clock.error}
        selector={selector}
        paused={panelOpen}
        toast={toast}
        kingdomError={kingdomError}
        onKingdomRetry={onKingdomRetry}
        onRetry={() => {
          setSpriteError("");
          clock.clearError();
          setRetryKey((k) => k + 1);
          void clock.flushPending();
        }}
      />
      {settings.showStick && !panelOpen && <TouchStick onChange={setStick} />}
      {openVillager && openBuilding && (
        <DeedPanel
          childId={childId}
          villager={openVillager}
          building={openBuilding}
          profile={bundle.profile}
          calm={calm}
          preview={!isChildView}
          onFinished={onDeedFinished}
          onClose={() => setOpenVillagerId(null)}
        />
      )}
    </div>,
    portalTarget
  );
}
