import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../src/locales";
import en from "../src/locales/en.json";
import {
  formatDistance,
  formatDuration,
  matchLocale,
  translate,
  translatePlural,
} from "../src/lib/i18n-core";
import { checkPreservation, numbersIn, properNouns } from "../src/lib/translation-check";

type Tree = { [key: string]: string | Tree };
const PLURAL = new Set(["zero", "one", "two", "few", "many", "other"]);
const isPlural = (node: Tree) => Object.keys(node).every((key) => PLURAL.has(key)) && "other" in node;

function leaves(node: Tree, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") return [path];
    return isPlural(value) ? [`${path}.*`] : leaves(value, path);
  });
}

function get(node: Tree, path: string): string | Tree | undefined {
  return path.split(".").reduce<string | Tree | undefined>((current, part) =>
    current && typeof current === "object" ? current[part] : undefined, node);
}

describe("locale files", () => {
  const english = leaves(en as Tree);

  for (const locale of LOCALES) {
    it(`${locale.code} has every key, including the plural forms its language uses`, () => {
      const messages = locale.messages as unknown as Tree;
      const missing = english.filter((key) => {
        if (!key.endsWith(".*")) return typeof get(messages, key) !== "string";
        const node = get(messages, key.slice(0, -2));
        if (!node || typeof node !== "object" || typeof node.other !== "string") return true;
        const rules = new Intl.PluralRules(locale.code);
        return [0, 1, 2, 5, 21, 104].some((n) => typeof node[rules.select(n)] !== "string" && rules.select(n) !== "other");
      });
      expect(missing).toEqual([]);
      const extra = leaves(messages).filter((key) => !key.endsWith(".*") && !english.includes(key));
      expect(extra).toEqual([]);
    });

    it(`${locale.code} keeps every placeholder`, () => {
      const messages = locale.messages as unknown as Tree;
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      for (const key of english.filter((k) => !k.endsWith(".*"))) {
        const source = get(en as Tree, key) as string;
        const target = get(messages, key) as string;
        // A translation may drop a variable the grammar does not need, but never invent one.
        for (const name of placeholders(target)) expect(placeholders(source), `${locale.code} ${key}`).toContain(name);
      }
    });
  }

  it("registry entries carry speech settings", () => {
    for (const locale of LOCALES) {
      expect(locale.speechSynthesisLang).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(locale.sttLang).toMatch(/^[a-z]{2}$/);
      expect(locale.nativeLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("keys used in the interface exist", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|ts)$/.test(name)) files.push(path);
    }
  };
  walk(join(__dirname, "../src"));
  const used = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\b(?:t|plural)\("([a-zA-Z][\w.]*)"/g)) used.add(match[1]);
    for (const match of text.matchAll(/translate(?:Plural)?\([^,()]+,\s*"([a-zA-Z][\w.]*)"/g)) used.add(match[1]);
  }

  it("finds the literal keys", () => {
    expect(used.size).toBeGreaterThan(150);
  });

  it("every literal key resolves in English", () => {
    const missing = [...used].filter((key) => {
      const node = get(en as Tree, key);
      return node === undefined || (typeof node === "object" && !isPlural(node));
    });
    expect(missing).toEqual([]);
  });
});

describe("translation and formatting", () => {
  it("falls back to English for a missing key and interpolates values", () => {
    expect(translate("es", "home.routesNear", { place: "Denver" })).toBe("Rutas cerca de Denver");
    expect(translate("en", "narration.station", { name: "Granby" })).toBe("Station approaching: Granby.");
    expect(translate("zh-CN", "nonexistent.key")).toBe("nonexistent.key");
  });
  it("chooses plural forms by language", () => {
    expect(translatePlural("en", "advisor.highlights", 1)).toBe("1 highlight");
    expect(translatePlural("en", "advisor.highlights", 9)).toBe("9 highlights");
    expect(translatePlural("es", "advisor.highlights", 1)).toBe("1 punto destacado");
    expect(translatePlural("zh-CN", "advisor.highlights", 9)).toBe("9 个亮点");
  });
  it("formats distances and durations per locale", () => {
    expect(formatDistance("en", 932)).toBe("930 m");
    expect(formatDistance("en", 1234)).toBe("1.2 km");
    expect(formatDistance("es", 1234)).toBe("1,2 km");
    expect(formatDuration("en", 125)).toBe("2 min");
    expect(formatDuration("en", 4800)).toBe("1 hr 20 min");
  });
  it("matches browser languages to supported locales", () => {
    expect(matchLocale("es-MX")).toBe("es");
    expect(matchLocale("zh-TW")).toBe("zh-CN");
    expect(matchLocale("fr-FR")).toBe("en");
    expect(matchLocale(undefined)).toBe("en");
  });
});

describe("translation preservation check", () => {
  it("finds numbers regardless of thousands separators", () => {
    expect(numbersIn("It opened in 1928 and runs 6.2 miles, rising 1,200 feet.")).toEqual(["1928", "6.2", "1200"]);
    expect(numbersIn("Se abrió en 1928 y sube 1.200 pies; mide 6,2 millas.")).toEqual(["1928", "1200", "6.2"]);
  });
  it("finds proper nouns but not sentence-opening words", () => {
    expect(properNouns("The Moffat Tunnel opened in 1928. It crosses the Continental Divide.")).toEqual(["Moffat", "Continental"]);
    expect(properNouns("The tunnel opened.")).toEqual([]);
  });
  it("passes a faithful Spanish translation and fails a changed year or a dropped name", () => {
    const english = "The Moffat Tunnel opened in 1928 under James Peak.";
    expect(checkPreservation(english, "El túnel Moffat se inauguró en 1928 bajo el James Peak.", "es").ok).toBe(true);
    const wrongYear = checkPreservation(english, "El túnel Moffat se inauguró en 1927 bajo el James Peak.", "es");
    expect(wrongYear.missingNumbers).toEqual(["1928"]);
    const noName = checkPreservation(english, "El túnel se inauguró en 1928 bajo un pico.", "es");
    expect(noName.missingNames).toEqual(["Moffat", "James"]);
  });
  it("accepts a Chinese transliteration only through the glossary", () => {
    const english = "The Moffat Tunnel opened in 1928.";
    const translated = "莫法特隧道于1928年开通。";
    expect(checkPreservation(english, translated, "zh-CN").ok).toBe(false);
    expect(checkPreservation(english, translated, "zh-CN", { "Moffat Tunnel": "莫法特隧道" }).ok).toBe(true);
  });
});
