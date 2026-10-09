import { describe, it, expect } from "vitest";
import { korjaaVuotanutHavainto } from "./rtAnalyysi";

describe("korjaaVuotanutHavainto", () => {
  it("palauttaa normaalin havainnon ja ehdotukset sellaisenaan", () => {
    const ehdotukset = [{ aihe: "a" }];
    expect(korjaaVuotanutHavainto("Kuvassa on sauna.", ehdotukset)).toEqual({
      havainto: "Kuvassa on sauna.",
      ehdotukset,
    });
  });

  it("poimii havaintoon vuotaneet ehdotukset ja siivoaa havainnon", () => {
    const vuotanut =
      'Kuvassa on tynnyrisauna.</havainto> <parameter name="ehdotukset">[ { "aihe": "Savupiipun läpivienti", ' +
      '"kuvaus": "k", "rtKortti": "RT 91-11259", "lakipykala": "", "varmuus": "matala" } ]';
    const tulos = korjaaVuotanutHavainto(vuotanut, []);
    expect(tulos.havainto).toBe("Kuvassa on tynnyrisauna.");
    expect(tulos.ehdotukset).toEqual([
      { aihe: "Savupiipun läpivienti", kuvaus: "k", rtKortti: "RT 91-11259", lakipykala: "", varmuus: "matala" },
    ]);
  });

  it("sietää loppuun vuotaneet sulkevat tagit", () => {
    const vuotanut = 'Havainto.</havainto>\n<parameter name="ehdotukset">[]</parameter>';
    expect(korjaaVuotanutHavainto(vuotanut, undefined)).toEqual({ havainto: "Havainto.", ehdotukset: [] });
  });

  it("pitää oikeat ehdotukset, vaikka havainnossa olisi merkintäroskaa", () => {
    const ehdotukset = [{ aihe: "oikea" }];
    const tulos = korjaaVuotanutHavainto('Havainto.</havainto> <parameter name="ehdotukset">[{"aihe":"vuoto"}]', ehdotukset);
    expect(tulos).toEqual({ havainto: "Havainto.", ehdotukset });
  });

  it("ei kaadu jäsentymättömään loppuosaan", () => {
    expect(korjaaVuotanutHavainto('Havainto.</havainto> <parameter name="ehdotukset">[{ rikki', [])).toEqual({
      havainto: "Havainto.",
      ehdotukset: [],
    });
  });
});
