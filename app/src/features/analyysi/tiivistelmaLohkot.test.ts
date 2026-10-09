import { describe, it, expect } from "vitest";
import { jasennaTiivistelma } from "./tiivistelmaLohkot";

describe("jasennaTiivistelma", () => {
  it("erottaa otsikot, kappaleet ja luettelot", () => {
    const teksti = [
      "RT 91-11259 Saunan kiukaat ja savupiiput (2017)",
      "",
      "MITÄ KORTTI KÄSITTELEE:",
      "Kortti käsittelee kiukaita.",
      "",
      "KESKEISET VAATIMUKSET:",
      "- Suojaetäisyys 100 mm",
      "- Sulkupelti vaaditaan",
    ].join("\n");

    expect(jasennaTiivistelma(teksti)).toEqual([
      { tyyppi: "kappale", teksti: "RT 91-11259 Saunan kiukaat ja savupiiput (2017)" },
      { tyyppi: "otsikko", teksti: "MITÄ KORTTI KÄSITTELEE" },
      { tyyppi: "kappale", teksti: "Kortti käsittelee kiukaita." },
      { tyyppi: "otsikko", teksti: "KESKEISET VAATIMUKSET" },
      { tyyppi: "lista", kohdat: ["Suojaetäisyys 100 mm", "Sulkupelti vaaditaan"] },
    ]);
  });

  it("erottaa saman rivin otsikon ja tekstin", () => {
    expect(jasennaTiivistelma("MITÄ KÄSITTELEE: Asetus koskee savupiippuja.")).toEqual([
      { tyyppi: "otsikko", teksti: "MITÄ KÄSITTELEE" },
      { tyyppi: "kappale", teksti: "Asetus koskee savupiippuja." },
    ]);
  });

  it("ei tulkitse tunnusriviä otsikoksi, vaikka rivillä on kaksoispiste myöhemmin", () => {
    const rivi = "RT RakMK-21756 / YM:n asetus savupiippujen rakenteista (745/2017)";
    expect(jasennaTiivistelma(rivi)).toEqual([{ tyyppi: "kappale", teksti: rivi }]);
  });

  it("tunnistaa omalla rivillään olevan otsikon ilman kaksoispistettä", () => {
    expect(jasennaTiivistelma("MITÄ KORTTI KÄSITTELEE\nKortti esittelee kynnyksen.")).toEqual([
      { tyyppi: "otsikko", teksti: "MITÄ KORTTI KÄSITTELEE" },
      { tyyppi: "kappale", teksti: "Kortti esittelee kynnyksen." },
    ]);
  });

  it("ei tulkitse pelkkää tunnusta otsikoksi", () => {
    expect(jasennaTiivistelma("RT 91-11259")).toEqual([{ tyyppi: "kappale", teksti: "RT 91-11259" }]);
  });

  it("ei tulkitse tavallista virkettä otsikoksi", () => {
    expect(jasennaTiivistelma("Suojaetäisyys: vähintään 100 mm.")).toEqual([
      { tyyppi: "kappale", teksti: "Suojaetäisyys: vähintään 100 mm." },
    ]);
  });
});
