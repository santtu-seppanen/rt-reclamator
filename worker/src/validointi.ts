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

export function validoiAnalysoiPyynto(data: unknown): AnalysoiValidointiTulos {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, virhe: "Pyyntö täytyy olla JSON-objekti" };
  }

  const { tekija, muistiinpano, lat, lng, kuva } = data as Record<string, unknown>;

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

  return {
    ok: true,
    pyynto: {
      tekija: tekija.trim(),
      muistiinpano: siistiMuistiinpano,
      lat: sijaintiTulos.lat,
      lng: sijaintiTulos.lng,
      kuva: kuvaTulos.kuva,
    },
  };
}
