import { describe, it, expect } from "vitest";
import { hakusananOsat } from "./d1";

describe("hakusananOsat", () => {
  it("pilkkoo sanoihin ja lyhentää pitkät sanat taivutusmuotojen yli", () => {
    expect(hakusananOsat("Märkätilan vedeneristys")).toEqual(["märkät", "vedene"]);
  });

  it("ei lyhennä numeroita sisältäviä tunnuksen osia", () => {
    expect(hakusananOsat("RT 84-11166")).toEqual(["84-11166"]);
  });

  it("pudottaa lyhyet sanat ja duplikaatit", () => {
    expect(hakusananOsat("ja katto, katto ok")).toEqual(["katto"]);
  });

  it("palauttaa tyhjän listan tyhjälle hakusanalle", () => {
    expect(hakusananOsat("  ")).toEqual([]);
  });
});
