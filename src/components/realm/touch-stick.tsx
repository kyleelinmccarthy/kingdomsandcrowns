"use client";

import { useRef, useState } from "react";

/** A thumb-sized joystick reporting a screen-space axis in −1..1. Pointer events, so it works with fingers and mice. */
export function TouchStick({ onChange, size = 120 }: { onChange: (axis: { x: number; y: number }) => void; size?: number }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const radius = size / 2;

  function update(e: React.PointerEvent) {
    const rect = base.current!.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    const clamp = Math.min(1, len / radius);
    const x = len === 0 ? 0 : (dx / len) * clamp;
    const y = len === 0 ? 0 : (-dy / len) * clamp; // screen y grows downward; "up" is positive for the stick
    setKnob({ x, y });
    onChange({ x, y });
  }

  function release(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  }

  return (
    <div
      ref={base}
      role="group"
      aria-label="Move"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0) return;
        update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="realm-stick"
      style={{ width: size, height: size }}
    >
      <div className="realm-stick-knob" style={{ transform: `translate(${knob.x * radius * 0.6}px, ${-knob.y * radius * 0.6}px)` }} />
    </div>
  );
}
