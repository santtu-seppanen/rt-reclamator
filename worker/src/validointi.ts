import type { AnalyysiTila } from "./rtAnalyysi.js";

export interface KuvaKentta {
  tiedostopaate: string;
  data: string;
}

export interface AnalysoiPyynto {
  tekija: string;
  muistiinpano: string | null;
  lat: number | null;
  lng: number | null;
  kuva: KuvaKentta;
  tila: AnalyysiTila;
}

export type AnalysoiValidointiTulos =
  | { ok: true; pyynto: AnalysoiPyynto }
  | { ok: false; virhe: string };

const TEKIJA_MAX_PITUUS = 50;
const MUISTIINPANO_MAX_PITUUS = 500;
// SVG/GIF eivät kelpaa Anthropic-API:n kuvasyötteeksi, joten niitä ei
// hyväksytä tässä vaikka worker/r2.ts:n paattelSisaltotyyppi tunnistaisi ne.
const SALLITUT_KUVAPAATTEET = new Set(["jpg", "jpeg", "png", "webp"]);
// ~3 Mt dekoodattuna base64:sta. Frontend pakkaa kamerakuvat tätä
// pienemmiksi ennen lähetystä (ks. app/src/lib/kuvaPakkaus.ts), tämä on
// vain viimeinen turvaraja R2-tallennuksen ja Anthropic-API-kutsun varalle.
const KUVA_MAX_BASE64_PITUUS = 4_000_000;

function validoiKuvaKentta(kuva: unknown): { ok: true; kuva: KuvaKentta } | { ok: false; virhe: string } {
  if (typeof kuva !== "object" || kuva === null || Array.isArray(kuva)) {
    return { ok: false, virhe: "kuva on pakollinen" };
  }
  const { tiedostopaate, data: kuvaData } = kuva as Record<string, unknown>;

  if (
    typeof tiedostopaate !== "string" ||
    !SALLITUT_KUVAPAATTEET.has(tiedostopaate.toLowerCase())
  ) {
    return {
      ok: false,
      virhe: `kuva.tiedostopaate täytyy olla yksi: ${[...SALLITUT_KUVAPAATTEET].join(", ")}`,
    };
  }

  if (typeof kuvaData !== "string" || kuvaData.length === 0) {
    return { ok: false, virhe: "kuva.data on pakollinen" };
  }
  if (kuvaData.length > KUVA_MAX_BASE64_PITUUS) {
    return { ok: false, virhe: "kuva on liian suuri" };
  }

  return {
    ok: true,
    kuva: { tiedostopaate: tiedostopaate.toLowerCase(), data: kuvaData },
  };
}

/** Puuttuva tila = "taydellinen" (nykyinen, jo julkaistu oletuskäytös säilyy vanhoille kutsujille). */
function validoiTila(tila: unknown): { ok: true; tila: AnalyysiTila } | { ok: false; virhe: string } {
  if (tila === undefined || tila === null) return { ok: true, tila: "taydellinen" };
  if (tila === "nopea" || tila === "taydellinen") return { ok: true, tila };
  return { ok: false, virhe: 'tila täytyy olla "nopea" tai "taydellinen"' };
}

/** lat/lng ovat valinnaisia, mutta jos toinen annetaan täytyy molemmat antaa. */
function validoiSijainti(
  lat: unknown,
  lng: unknown,
): { ok: true; lat: number | null; lng: number | null } | { ok: false; virhe: string } {
  if (lat === null && lng === null) return { ok: true, lat: null, lng: null };
  if (lat === undefined && lng === undefined) return { ok: true, lat: null, lng: null };

  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, virhe: "lat täytyy olla luku välillä -90..90" };
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, virhe: "lng täytyy olla luku välillä -180..180" };
  }

  return { ok: true, lat, lng };
}

/** Valinnainen, trimmattu merkkijonokenttä; tyhjä → null. */
function validoiValinnainenTeksti(
  arvo: unknown,
  kentta: string,
  maxPituus: number,
): { ok: true; arvo: string | null } | { ok: false; virhe: string } {
  if (arvo === null || arvo === undefined) return { ok: true, arvo: null };
  if (typeof arvo !== "string") return { ok: false, virhe: `${kentta} täytyy olla merkkijono` };
  if (arvo.length > maxPituus) return { ok: false, virhe: `${kentta} saa olla enintään ${maxPituus} merkkiä` };
  return { ok: true, arvo: arvo.trim() || null };
}

export interface ReklamaatioPyynto {
  kuvaId: string;
  /** Indeksit analyysin ehdotukset-taulukkoon — mitkä virheet reklamaatioon otetaan. */
  ehdotusIndeksit: number[];
  lisatieto: string | null;
  tekija: string | null;
}

export type ReklamaatioValidointiTulos =
  | { ok: true; pyynto: ReklamaatioPyynto }
  | { ok: false; virhe: string };

const LISATIETO_MAX_PITUUS = 1000;

/**
 * Tarkistaa vain pyynnön muodon — se, että kuvaId on olemassa ja indeksit
 * osuvat sen ehdotuksiin, tarkistetaan D1:tä vasten index.ts:ssä.
 */
export function validoiReklamaatioPyynto(data: unknown): ReklamaatioValidointiTulos {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, virhe: "Pyyntö täytyy olla JSON-objekti" };
  }

  const { kuvaId, ehdotusIndeksit, lisatieto, tekija } = data as Record<string, unknown>;

  if (typeof kuvaId !== "string" || kuvaId.trim().length === 0) {
    return { ok: false, virhe: "kuvaId on pakollinen" };
  }

  if (
    !Array.isArray(ehdotusIndeksit) ||
    ehdotusIndeksit.length === 0 ||
    !ehdotusIndeksit.every((i) => typeof i === "number" && Number.isInteger(i) && i >= 0)
  ) {
    return { ok: false, virhe: "ehdotusIndeksit täytyy olla vähintään yhden ei-negatiivisen kokonaisluvun taulukko" };
  }

  const lisatietoTulos = validoiValinnainenTeksti(lisatieto, "lisatieto", LISATIETO_MAX_PITUUS);
  if (!lisatietoTulos.ok) return lisatietoTulos;

  const tekijaTulos = validoiValinnainenTeksti(tekija, "tekija", TEKIJA_MAX_PITUUS);
  if (!tekijaTulos.ok) return tekijaTulos;

  return {
    ok: true,
    pyynto: {
      kuvaId: kuvaId.trim(),
      ehdotusIndeksit: [...new Set(ehdotusIndeksit as number[])].sort((a, b) => a - b),
      lisatieto: lisatietoTulos.arvo,
      tekija: tekijaTulos.arvo,
    },
  };
}

export interface PalautePyynto {
  reklamaatioId: string;
  /** Yksi reklamaatioon valituista ehdotusindekseistä; null = palaute koskee koko reklamaatiota. */
  ehdotusIndeksi: number | null;
  arvio: "hyva" | "huono" | null;
  kommentti: string | null;
  /** Käyttäjän muokkaama reklamaatioteksti, jos se poikkeaa luonnoksesta. */
  muokattuTeksti: string | null;
  tekija: string | null;
}

export type PalauteValidointiTulos =
  | { ok: true; pyynto: PalautePyynto }
  | { ok: false; virhe: string };

const KOMMENTTI_MAX_PITUUS = 1000;
const MUOKATTU_TEKSTI_MAX_PITUUS = 20_000;

/**
 * Tarkistaa vain pyynnön muodon — se, että reklamaatio on olemassa ja
 * ehdotusIndeksi on yksi sen valituista, tarkistetaan D1:tä vasten
 * index.ts:ssä. Arvio tai kommentti on pakollinen (tyhjä palaute ei kerro
 * mitään kehotteen parantamiseen).
 */
export function validoiPalautePyynto(data: unknown): PalauteValidointiTulos {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, virhe: "Pyyntö täytyy olla JSON-objekti" };
  }

  const { reklamaatioId, ehdotusIndeksi, arvio, kommentti, muokattuTeksti, tekija } = data as Record<string, unknown>;

  if (typeof reklamaatioId !== "string" || reklamaatioId.trim().length === 0) {
    return { ok: false, virhe: "reklamaatioId on pakollinen" };
  }

  let siistiIndeksi: number | null = null;
  if (ehdotusIndeksi !== null && ehdotusIndeksi !== undefined) {
    if (typeof ehdotusIndeksi !== "number" || !Number.isInteger(ehdotusIndeksi) || ehdotusIndeksi < 0) {
      return { ok: false, virhe: "ehdotusIndeksi täytyy olla ei-negatiivinen kokonaisluku tai null" };
    }
    siistiIndeksi = ehdotusIndeksi;
  }

  let siistiArvio: "hyva" | "huono" | null = null;
  if (arvio !== null && arvio !== undefined) {
    if (arvio !== "hyva" && arvio !== "huono") {
      return { ok: false, virhe: 'arvio täytyy olla "hyva", "huono" tai null' };
    }
    siistiArvio = arvio;
  }

  const kommenttiTulos = validoiValinnainenTeksti(kommentti, "kommentti", KOMMENTTI_MAX_PITUUS);
  if (!kommenttiTulos.ok) return kommenttiTulos;

  if (siistiArvio === null && kommenttiTulos.arvo === null) {
    return { ok: false, virhe: "Anna arvio tai kommentti" };
  }

  const muokattuTulos = validoiValinnainenTeksti(muokattuTeksti, "muokattuTeksti", MUOKATTU_TEKSTI_MAX_PITUUS);
  if (!muokattuTulos.ok) return muokattuTulos;

  const tekijaTulos = validoiValinnainenTeksti(tekija, "tekija", TEKIJA_MAX_PITUUS);
  if (!tekijaTulos.ok) return tekijaTulos;

  return {
    ok: true,
    pyynto: {
      reklamaatioId: reklamaatioId.trim(),
      ehdotusIndeksi: siistiIndeksi,
      arvio: siistiArvio,
      kommentti: kommenttiTulos.arvo,
      muokattuTeksti: muokattuTulos.arvo,
      tekija: tekijaTulos.arvo,
    },
  };
}

export function validoiAnalysoiPyynto(data: unknown): AnalysoiValidointiTulos {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, virhe: "Pyyntö täytyy olla JSON-objekti" };
  }

  const { tekija, muistiinpano, lat, lng, kuva, tila } = data as Record<string, unknown>;

  if (typeof tekija !== "string" || tekija.trim().length === 0) {
    return { ok: false, virhe: "tekija on pakollinen" };
  }
  if (tekija.length > TEKIJA_MAX_PITUUS) {
    return { ok: false, virhe: `tekija saa olla enintään ${TEKIJA_MAX_PITUUS} merkkiä` };
  }

  let siistiMuistiinpano: string | null = null;
  if (muistiinpano !== null && muistiinpano !== undefined) {
    if (typeof muistiinpano !== "string") {
      return { ok: false, virhe: "muistiinpano täytyy olla merkkijono" };
    }
    if (muistiinpano.length > MUISTIINPANO_MAX_PITUUS) {
      return { ok: false, virhe: `muistiinpano saa olla enintään ${MUISTIINPANO_MAX_PITUUS} merkkiä` };
    }
    const trimmattu = muistiinpano.trim();
    siistiMuistiinpano = trimmattu.length > 0 ? trimmattu : null;
  }

  const sijaintiTulos = validoiSijainti(lat, lng);
  if (!sijaintiTulos.ok) return sijaintiTulos;

  const kuvaTulos = validoiKuvaKentta(kuva);
  if (!kuvaTulos.ok) return kuvaTulos;

  const tilaTulos = validoiTila(tila);
  if (!tilaTulos.ok) return tilaTulos;

  return {
    ok: true,
    pyynto: {
      tekija: tekija.trim(),
      muistiinpano: siistiMuistiinpano,
      lat: sijaintiTulos.lat,
      lng: sijaintiTulos.lng,
      kuva: kuvaTulos.kuva,
      tila: tilaTulos.tila,
    },
  };
}
