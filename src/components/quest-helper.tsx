"use client";

import { useState, type ReactNode } from "react";
import { Feather, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { SendRavenDialog } from "@/components/send-raven";
import { isNavGroup, navItemsFor, type NavLink } from "@/components/nav-items";
import { GameIcon } from "@/components/game-icon";

/** One line of the guide: a place or a menu item, in its medallion, with what it is for. */
function GuideRow({ icon, label, description, children }: { icon: ReactNode; label: string; description: string; children?: ReactNode }) {
  return (
    <li>
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--gold-border)] bg-black/30"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </span>
      </div>
      {children}
    </li>
  );
}

const placeIcon = (item: Pick<NavLink, "icon">) => <GameIcon name={item.icon} className="size-5 text-[var(--gold-bright)]" />;

export function QuestHelper({ isChildView }: { isChildView?: boolean }) {
  const [open, setOpen] = useState(false);
  const [ravenOpen, setRavenOpen] = useState(false);

  const navItems = navItemsFor(isChildView);

  const intro = isChildView
    ? "Welcome, hero! These are the places you can visit. Tap an icon along the bottom to explore the realm."
    : "Welcome! Here's a quick tour of the realm. Tap an icon along the bottom bar to move between sections.";

  return (
    <>
      <Tooltip content="New here? A quick guide to getting around — and how to send us a raven.">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the guide — how to get around and how to send a raven"
          className="medallion"
        >
          <span className="medallion-icon" aria-hidden="true">
            <GameIcon name="compass" className="size-5 text-[var(--gold-bright)]" />
          </span>
          <span className="medallion-label">Help</span>
        </button>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Your Guide to the Realm</DialogTitle>
          <p className="text-sm font-serif text-muted-foreground">{intro}</p>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold tracking-wide text-[var(--gold-bright)]">
              Getting around
            </h3>
            <ul className="space-y-2">
              {navItems.map((entry) =>
                isNavGroup(entry) ? (
                  <GuideRow key={entry.label} icon={placeIcon(entry)} label={entry.label} description={`Tap ${entry.label} to open its menu:`}>
                    <ul className="mt-2 space-y-2 pl-11">
                      {entry.items.map((item) => (
                        <GuideRow key={item.href} icon={placeIcon(item)} label={item.label} description={item.description} />
                      ))}
                    </ul>
                  </GuideRow>
                ) : (
                  <GuideRow key={entry.href} icon={placeIcon(entry)} label={entry.label} description={entry.description} />
                ),
              )}
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[var(--gold-bright)]">
              <User className="size-4" aria-hidden="true" />
              Your account menu
            </h3>
            <p className="text-xs text-muted-foreground">
              Tap the medallion with your name (the{" "}
              <User className="inline size-3 align-text-bottom" aria-hidden="true" /> icon in the
              corner) to open your account menu. You&apos;ll find these inside:
            </p>
            <ul className="space-y-2 pt-1">
              <GuideRow
                icon={<Feather className="size-4" />}
                label="Send a Raven"
                description="Report a bug, share an idea, or just say hello — your message flies straight to the keepers of the kingdom."
              />
              <GuideRow icon={<Settings className="size-4" />} label="Settings" description="Manage your family, guardians, and account." />
            </ul>
          </div>

          <div className="space-y-2 rounded-md border border-[var(--gold-border)]/40 bg-[var(--gold-border)]/5 p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[var(--gold-bright)]">
              <Feather className="size-4" aria-hidden="true" />
              Found a bug or have an idea?
            </h3>
            <p className="text-xs text-muted-foreground">
              You can send a raven straight from here, too:
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setOpen(false);
                setRavenOpen(true);
              }}
            >
              <Feather className="size-4" aria-hidden="true" />
              Send a Raven
            </Button>
          </div>
        </div>
      </Dialog>

      <SendRavenDialog open={ravenOpen} onClose={() => setRavenOpen(false)} />
    </>
  );
}
