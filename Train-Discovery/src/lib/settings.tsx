"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import type { Facing } from "./route-geometry";

export const SETTINGS_KEY = "gaze:settings:v1";

const settingsSchema = z.object({
  facing: z.enum(["forward", "backward"]).default("forward"),
  sound: z.boolean().default(true),
  voice: z.boolean().default(true),
  strips: z
    .object({ pois: z.boolean(), air: z.boolean(), signal: z.boolean() })
    .default({ pois: true, air: false, signal: false }),
});

export type Settings = z.infer<typeof settingsSchema> & { facing: Facing };
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type SettingsContextValue = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    queueMicrotask(() => setSettings(readSettings()));
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Settings still apply for this visit.
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
