import en from "./en.json";
import es from "./es.json";
import zhCN from "./zh-CN.json";

/**
 * Locale registry. To add a language, add `<code>.json` with the same keys as
 * en.json and one entry below. Missing keys fall back to English.
 */
export type Messages = typeof en;

export type LocaleInfo = {
  /** BCP 47 tag. Also the key for localized content. */
  code: string;
  /** Name in English. */
  label: string;
  /** Name in the language itself, shown in the language menu. */
  nativeLabel: string;
  dir: "ltr" | "rtl";
  /** ElevenLabs voice; null uses the server's ELEVENLABS_VOICE_ID (George). */
  ttsVoiceId: string | null;
  /** Language hint for speech-to-text. */
  sttLang: string;
  /** Language tag for the browser's speech synthesis fallback. */
  speechSynthesisLang: string;
  messages: Messages;
};

export const DEFAULT_LOCALE = "en";

export const LOCALES: LocaleInfo[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    dir: "ltr",
    ttsVoiceId: null,
    sttLang: "en",
    speechSynthesisLang: "en-US",
    messages: en,
  },
  {
    code: "es",
    label: "Spanish",
    nativeLabel: "Español",
    dir: "ltr",
    ttsVoiceId: null,
    sttLang: "es",
    speechSynthesisLang: "es-ES",
    messages: es as Messages,
  },
  {
    code: "zh-CN",
    label: "Chinese (Simplified)",
    nativeLabel: "中文",
    dir: "ltr",
    ttsVoiceId: null,
    sttLang: "zh",
    speechSynthesisLang: "zh-CN",
    messages: zhCN as Messages,
  },
];
