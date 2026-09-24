import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { haeTekijanNimi, tallennaTekijanNimi } from "./tekijanNimi";

/**
 * Node 25:n sisäänrakennettu globaali localStorage ei toimi luotettavasti
 * tässä testiympäristössä (kirjoitukset eivät pysy muistissa ilman
 * --localstorage-file-lippua), ja se peittää jsdomin oman toteutuksen.
 * Korvataan se yksinkertaisella muistivarastolla vain näiden testien ajaksi.
 */
function luoMuistivarasto(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (avain: string) => data.get(avain) ?? null,
    setItem: (avain: string, arvo: string) => {
      data.set(avain, arvo);
    },
    removeItem: (avain: string) => {
      data.delete(avain);
    },
    clear: () => data.clear(),
    key: (indeksi: number) => [...data.keys()][indeksi] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("tekijanNimi", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", luoMuistivarasto());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("palauttaa tyhjän merkkijonon kun nimeä ei ole vielä tallennettu", () => {
    expect(haeTekijanNimi()).toBe("");
  });

  it("tallentaa ja hakee nimen", () => {
    tallennaTekijanNimi("Remontoija99");

    expect(haeTekijanNimi()).toBe("Remontoija99");
  });

  it("ylikirjoittaa aiemman tallennetun nimen", () => {
    tallennaTekijanNimi("Ensimmäinen");
    tallennaTekijanNimi("Toinen");

    expect(haeTekijanNimi()).toBe("Toinen");
  });
});
