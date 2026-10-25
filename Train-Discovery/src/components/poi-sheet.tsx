"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import "./poi-sheet.css";

type PoiSheetProps = {
  open: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDismiss: () => void;
  label: string;
  children: ReactNode;
};

type Drag = {
  id: number;
  startY: number;
  origin: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
};

export function PoiSheet(props: PoiSheetProps) {
  const { open, expanded, label, children } = props;
  const bodyId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(props);
  const engine = useRef<{
    sync: () => void;
    down: (event: PointerEvent<HTMLButtonElement>) => void;
    move: (event: PointerEvent<HTMLButtonElement>) => void;
    end: (event: PointerEvent<HTMLButtonElement>, cancelled: boolean) => void;
  } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    latest.current = props;
  });

  useLayoutEffect(() => {
    const sheet = sheetRef.current!;
    const handle = handleRef.current!;
    const controls = sheet.querySelector<HTMLElement>(".poi-sheet__controls")!;
    const body = sheet.querySelector<HTMLElement>(".poi-sheet__body")!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const measureGeometry = () => {
      const height = sheet.offsetHeight;
      // The registered CSS length resolves dvh to pixels independently of children.
      const collapsed = Math.min(
        height,
        parseFloat(
          getComputedStyle(sheet).getPropertyValue(
            "--poi-sheet-collapsed-height",
          ),
        ) || height,
      );
      return { height, collapsed, offset: height - collapsed };
    };
    let geometry = measureGeometry();
    let position = geometry.height + 2;
    let velocity = 0;
    let target = position;
    let previousTime = 0;
    let drag: Drag | null = null;
    let disposed = false;
    let controlsInert = controls.inert;
    let bodyInert = body.inert;
    const paint = () => {
      sheet.style.transform = `translate3d(0, ${position}px, 0)`;
      sheet.style.clipPath = `inset(0 0 ${Math.max(position, 0)}px 0 round 30px)`;
      const visible = Math.max(0, geometry.height - Math.max(position, 0));
      sheet.style.setProperty("--poi-sheet-visible-height", `${visible}px`);
      // Fully clipped controls must also leave the keyboard/accessibility tree.
      if (controlsInert !== visible < 56)
        controls.inert = controlsInert = visible < 56;
      if (bodyInert !== visible <= 56) body.inert = bodyInert = visible <= 56;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const finish = () => {
      if (!latest.current.open) sheet.style.visibility = "hidden";
    };
    const tick = (time: number) => {
      const elapsed = Math.min((time - previousTime) / 1000, 0.032);
      previousTime = time;
      // Substeps keep the spring stable on slower phone frames.
      const steps = Math.max(1, Math.ceil(elapsed / 0.008));
      const dt = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        velocity += (-380 * (position - target) - 30 * velocity) * dt;
        position += velocity * dt;
      }
      if (Math.abs(position - target) < 0.25 && Math.abs(velocity) < 3) {
        position = target;
        velocity = 0;
        frame = 0;
        paint();
        finish();
        return;
      }
      paint();
      frame = requestAnimationFrame(tick);
    };
    const settle = (next: number, speed = velocity) => {
      stop();
      target = next;
      velocity = speed;
      if (motion.matches) {
        position = target;
        velocity = 0;
        paint();
        finish();
      } else {
        previousTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const releaseCapture = () => {
      const id = drag?.id;
      drag = null;
      delete sheet.dataset.dragging;
      if (id !== undefined && handle.hasPointerCapture(id))
        handle.releasePointerCapture(id);
    };
    const sync = () => {
      if (disposed) return;
      releaseCapture();
      const { height, offset } = geometry;
      const current = latest.current;
      const next = current.open ? (current.expanded ? 0 : offset) : height + 2;
      if (current.open) {
        sheet.style.visibility = "visible";
      } else if (sheet.contains(document.activeElement))
        (document.activeElement as HTMLElement).blur();
      settle(next);
    };

    engine.current = {
      sync,
      down(event) {
        if (
          !latest.current.open ||
          drag ||
          !event.isPrimary ||
          event.button !== 0
        )
          return;
        stop(); // position already holds the currently painted animation frame.
        suppressClick.current = false;
        drag = {
          id: event.pointerId,
          startY: event.clientY,
          origin: position,
          lastY: event.clientY,
          lastTime: event.timeStamp,
          velocity: 0,
          moved: false,
        };
        velocity = 0;
        handle.setPointerCapture(event.pointerId);
        sheet.dataset.dragging = "true";
      },
      move(event) {
        if (!drag || drag.id !== event.pointerId) return;
        const elapsed = event.timeStamp - drag.lastTime;
        if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed;
        drag.lastTime = event.timeStamp;
        drag.lastY = event.clientY;
        const delta = event.clientY - drag.startY;
        drag.moved ||= Math.abs(delta) > 5;
        const next = drag.origin + delta;
        position =
          next < 0
            ? Math.max(-28, next * 0.18)
            : Math.min(geometry.height + 2, next);
        paint();
      },
      end(event, cancelled) {
        if (!drag || event.pointerId !== drag.id) return;
        const gesture = drag;
        const speed =
          event.timeStamp - gesture.lastTime > 90 ? 0 : gesture.velocity;
        suppressClick.current = gesture.moved;
        releaseCapture();
        if (cancelled || !gesture.moved) {
          sync();
          return;
        }
        const { offset, collapsed, height } = geometry;
        const projected = position + speed * 180;
        if (projected > offset + Math.max(80, collapsed * 0.25)) {
          settle(height + 2, speed * 1000);
          latest.current.onDismiss();
        } else {
          const nextExpanded = projected < offset / 2;
          settle(nextExpanded ? 0 : offset, speed * 1000);
          if (nextExpanded !== latest.current.expanded)
            latest.current.onExpandedChange(nextExpanded);
        }
      },
    };

    paint();
    sync();
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        latest.current.open &&
        !document.querySelector(
          "dialog[open], [role='dialog'][aria-modal='true']",
        )
      ) {
        event.preventDefault();
        latest.current.onDismiss();
      }
    };
    // Only the fixed sheet geometry is observed; child changes cannot reset a drag.
    const resize = () => {
      if (disposed) return;
      geometry = measureGeometry();
      sync();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(sheet);
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKey);
    motion.addEventListener("change", sync);
    return () => {
      disposed = true;
      stop();
      releaseCapture();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      motion.removeEventListener("change", sync);
      engine.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    engine.current?.sync();
  }, [open, expanded]);

  return (
    <section
      ref={sheetRef}
      className="poi-sheet"
      role="region"
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      data-expanded={expanded}
    >
      <div className="poi-sheet__controls">
        <button
          ref={handleRef}
          type="button"
          className="poi-sheet__handle"
          aria-label={expanded ? "Collapse sheet" : "Expand sheet"}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onPointerDown={(event) => engine.current?.down(event)}
          onPointerMove={(event) => engine.current?.move(event)}
          onPointerUp={(event) => engine.current?.end(event, false)}
          onPointerCancel={(event) => engine.current?.end(event, true)}
          onLostPointerCapture={(event) => engine.current?.end(event, true)}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
              event.preventDefault();
              latest.current.onExpandedChange(!latest.current.expanded);
            }
          }}
          onClick={(event) => {
            if (event.detail === 0 || !suppressClick.current)
              latest.current.onExpandedChange(!latest.current.expanded);
            suppressClick.current = false;
          }}
        >
          <span className="poi-sheet__grip" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="poi-sheet__close"
          aria-label="Close"
          onClick={() => latest.current.onDismiss()}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div id={bodyId} className="poi-sheet__body">
        {children}
      </div>
    </section>
  );
}
