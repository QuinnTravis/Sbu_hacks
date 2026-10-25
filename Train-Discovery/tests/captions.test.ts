import { describe, expect, it } from "vitest";
import { captionChunks, chunkAtChar, chunkAtFraction } from "../src/lib/captions";

describe("captions", () => {
  it("splits sentences without breaking decimals, and long sentences at clause breaks", () => {
    expect(captionChunks("Glenwood Canyon is a rugged scenic 12.5 mi (20 km) canyon. Its walls climb high."))
      .toEqual(["Glenwood Canyon is a rugged scenic 12.5 mi (20 km) canyon.", "Its walls climb high."]);
    const long = "Gore Canyon, elevation 6,985 feet (2,129 m), is a short isolated canyon on the upper Colorado River in southwestern Grand County, Colorado in the United States.";
    const chunks = captionChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 110)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
    expect(captionChunks("第一句。第二句。")).toEqual(["第一句。", "第二句。"]);
  });

  it("follows the clip position and speech boundaries", () => {
    const chunks = ["First line here.", "Second line here."];
    expect(chunkAtFraction(chunks, 0)).toBe("First line here.");
    expect(chunkAtFraction(chunks, Number.NaN)).toBe("First line here.");
    expect(chunkAtFraction(chunks, 0.8)).toBe("Second line here.");
    expect(chunkAtFraction(chunks, 1)).toBe("Second line here.");
    expect(chunkAtChar(chunks, 3)).toBe("First line here.");
    expect(chunkAtChar(chunks, 20)).toBe("Second line here.");
    expect(chunkAtFraction([], 0.5)).toBeNull();
  });
});
