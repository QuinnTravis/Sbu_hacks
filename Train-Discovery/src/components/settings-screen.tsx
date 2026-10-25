"use client";

import Link from "next/link";
import { ChevronRight, Languages } from "lucide-react";
import { features } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

export function SettingsScreen() {
  const { t, code, locales, setLocale } = useI18n();
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
      </div>
      <nav className="settings-links" aria-label={t("settings.title")}>
        <Link href="/about">
          {t("settings.about")}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </section>
  );
}
