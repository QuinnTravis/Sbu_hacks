"use client";

import Link from "next/link";
import { ChevronRight, Languages } from "lucide-react";
import { features } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

export function SettingsScreen({
  offlineReady,
  onClearOffline,
}: {
  offlineReady: number;
  onClearOffline?: () => void;
}) {
  const { t, code, locales, setLocale, plural } = useI18n();
  const { settings, update } = useSettings();
  return (
    <section className="settings-screen" aria-labelledby="settings-title">
      <div className="screen-heading">
        <h1 id="settings-title">{t("settings.title")}</h1>
      </div>
      {features.i18n && (
        <fieldset className="settings-group">
          <legend>
            <Languages size={16} aria-hidden="true" />
            {t("settings.language")}
          </legend>
          <div className="segmented is-wrap" role="radiogroup" aria-label={t("settings.language")}>
            {locales.map((locale) => (
              <button
                key={locale.code}
                type="button"
                role="radio"
                aria-checked={code === locale.code}
                lang={locale.code}
                onClick={() => setLocale(locale.code)}
              >
                {locale.nativeLabel}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="settings-group">
        <legend>{t("settings.facing")}</legend>
        <div className="segmented" role="radiogroup" aria-label={t("settings.facing")}>
          {(["forward", "backward"] as const).map((facing) => (
            <button
              key={facing}
              type="button"
              role="radio"
              aria-checked={settings.facing === facing}
              onClick={() => update({ facing })}
            >
              {t(`settings.${facing}`)}
            </button>
          ))}
        </div>
        <p className="settings-hint">{t("settings.facingHint")}</p>
      </fieldset>
      <div className="settings-group settings-toggles">
        <label className="toggle-row">
          <span>
            <strong>{t("settings.sound")}</strong>
            <small>{t("settings.soundHint")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.sound}
            onChange={(event) => update({ sound: event.target.checked })}
          />
        </label>
        {features.voice && (
          <label className="toggle-row">
            <span>
              <strong>{t("settings.voice")}</strong>
              <small>{t("settings.voiceHint")}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.voice}
              onChange={(event) => update({ voice: event.target.checked })}
            />
          </label>
        )}
      </div>
      {features.connectivity && (
        <div className="settings-group settings-offline">
          <span>
            <strong>{t("settings.offline")}</strong>
            <small>{plural("settings.offlineReady", offlineReady)}</small>
          </span>
          {onClearOffline && offlineReady > 0 && (
            <button type="button" className="secondary-button" onClick={onClearOffline}>
              {t("settings.clearOffline")}
            </button>
          )}
        </div>
      )}
      <nav className="settings-links" aria-label={t("settings.title")}>
        <Link href="/about">
          {t("settings.about")}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/credits">
          {t("settings.credits")}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </section>
  );
}
