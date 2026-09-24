import { describe, it, expect } from "vitest";
import { validoiAnalysoiPyynto } from "./validointi";

describe("validoiAnalysoiPyynto", () => {
  const validipyynto = {
    tekija: "Testaaja",
    muistiinpano: "Kylpyhuoneen remontti",
    lat: 60.1699,
    lng: 24.9384,
    kuva: {
      tiedostopaate: "jpg",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    },
  };

  it("hyväksyy validin pyynnön", () => {
    const tulos = validoiAnalysoiPyynto(validipyynto);

    expect(tulos.ok).toBe(true);
    if (tulos.ok) {
      expect(tulos.pyynto.tekija).toBe("Testaaja");
      expect(tulos.pyynto.muistiinpano).toBe("Kylpyhuoneen remontti");
      expect(tulos.pyynto.lat).toBe(60.1699);
      expect(tulos.pyynto.lng).toBe(24.9384);
    }
  });

  it("hyväksyy pyynnön ilman muistiinpanoa ja sijaintia", () => {
    const tulos = validoiAnalysoiPyynto({
      tekija: "Testaaja",
      muistiinpano: null,
      lat: null,
      lng: null,
      kuva: validipyynto.kuva,
    });

    expect(tulos.ok).toBe(true);
    if (tulos.ok) {
      expect(tulos.pyynto.muistiinpano).toBeNull();
      expect(tulos.pyynto.lat).toBeNull();
      expect(tulos.pyynto.lng).toBeNull();
    }
  });

  it("trimmaa whitespace:sta tekija ja muistiinpano", () => {
    const tulos = validoiAnalysoiPyynto({
      ...validipyynto,
      tekija: "  Testaaja  ",
      muistiinpano: "  Kylpyhuoneen remontti  ",
    });

    expect(tulos.ok).toBe(true);
    if (tulos.ok) {
      expect(tulos.pyynto.tekija).toBe("Testaaja");
      expect(tulos.pyynto.muistiinpano).toBe("Kylpyhuoneen remontti");
    }
  });

  it("muuttaa tyhjän (whitespace-ainoastaan) muistiinpanon null:iksi", () => {
    const tulos = validoiAnalysoiPyynto({ ...validipyynto, muistiinpano: "   " });

    expect(tulos.ok).toBe(true);
    if (tulos.ok) {
      expect(tulos.pyynto.muistiinpano).toBeNull();
    }
  });

  it("lowercasee kuvan tiedostopaatteen", () => {
    const tulos = validoiAnalysoiPyynto({
      ...validipyynto,
      kuva: { tiedostopaate: "JPG", data: validipyynto.kuva.data },
    });

    expect(tulos.ok).toBe(true);
    if (tulos.ok) {
      expect(tulos.pyynto.kuva.tiedostopaate).toBe("jpg");
    }
  });

  describe("tekija validointi", () => {
    it("hylkää tyhjän tekijän", () => {
      const tulos = validoiAnalysoiPyynto({ ...validipyynto, tekija: "" });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("tekija on pakollinen");
      }
    });

    it("hylkää liian pitkän tekijän", () => {
      const tulos = validoiAnalysoiPyynto({ ...validipyynto, tekija: "a".repeat(51) });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("tekija saa olla enintään 50 merkkiä");
      }
    });
  });

  describe("muistiinpano validointi", () => {
    it("hylkää liian pitkän muistiinpanon", () => {
      const tulos = validoiAnalysoiPyynto({ ...validipyynto, muistiinpano: "a".repeat(501) });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("muistiinpano saa olla enintään 500 merkkiä");
      }
    });

    it("hylkää ei-merkkijono muistiinpanon", () => {
      const tulos = validoiAnalysoiPyynto({ ...validipyynto, muistiinpano: 123 });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("muistiinpano täytyy olla merkkijono");
      }
    });
  });

  describe("sijainti validointi", () => {
    it("hylkää pyynnön jossa vain lat annettu", () => {
      const tulos = validoiAnalysoiPyynto({ ...validipyynto, lat: 60.1699, lng: null });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toContain("lng");
      }
    });

    it("hylkää lat:in joka on alle -90", () => {
      const tulos = validoiAnalysoiPyynto({ ...validipyynto, lat: -91 });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toContain("välillä -90..90");
      }
    });

    it("hylkää lng:n joka on yli 180", () => {
      const tulos = validoiAnalysoiPyynto({ ...validipyynto, lng: 181 });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toContain("välillä -180..180");
      }
    });
  });

  describe("kuva validointi", () => {
    it("hylkää kuvan jonka tiedostopaate on tuntematon", () => {
      const tulos = validoiAnalysoiPyynto({
        ...validipyynto,
        kuva: { tiedostopaate: "svg", data: validipyynto.kuva.data },
      });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toContain("jpg, jpeg, png, webp");
      }
    });

    it("hylkää kuvan jonka data on tyhjä", () => {
      const tulos = validoiAnalysoiPyynto({
        ...validipyynto,
        kuva: { tiedostopaate: "jpg", data: "" },
      });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("kuva.data on pakollinen");
      }
    });

    it("hylkää kuvan joka ylittää max-koon", () => {
      const tulos = validoiAnalysoiPyynto({
        ...validipyynto,
        kuva: { tiedostopaate: "jpg", data: "a".repeat(4_000_001) },
      });

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("kuva on liian suuri");
      }
    });
  });

  describe("syötteen tyyppi", () => {
    it("hylkää null:in", () => {
      const tulos = validoiAnalysoiPyynto(null);

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("Pyyntö täytyy olla JSON-objekti");
      }
    });

    it("hylkää listan", () => {
      const tulos = validoiAnalysoiPyynto([]);

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("Pyyntö täytyy olla JSON-objekti");
      }
    });

    it("hylkää merkkijonon", () => {
      const tulos = validoiAnalysoiPyynto("pyynto");

      expect(tulos.ok).toBe(false);
      if (!tulos.ok) {
        expect(tulos.virhe).toBe("Pyyntö täytyy olla JSON-objekti");
      }
    });
  });
});
