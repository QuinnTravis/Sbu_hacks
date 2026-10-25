"use client";

import type { ReactNode } from "react";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { SettingsProvider } from "@/lib/settings";

function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main-content">
      {t("app.skip")}
    </a>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <SettingsProvider>
        <SkipLink />
        {children}
      </SettingsProvider>
    </I18nProvider>
  );
}
