import type { RtEhdotus } from "./rtAnalyysi.js";

export interface Kuva {
  id: string;
  tekija: string;
  tiedostonimi: string;
  muistiinpano: string | null;
  lat: number | null;
  lng: number | null;
  havainto: string;
  ehdotukset: RtEhdotus[];
  aika: string;
}

interface KuvaRivi {
  id: string;
  tekija: string;
  tiedostonimi: string;
  muistiinpano: string | null;
  lat: number | null;
  lng: number | null;
  havainto: string;
  ehdotukset: string;
  aika: string;
}

function kuvaRivista(rivi: KuvaRivi): Kuva {
  return {
    id: rivi.id,
    tekija: rivi.tekija,
    tiedostonimi: rivi.tiedostonimi,
    muistiinpano: rivi.muistiinpano,
    lat: rivi.lat,
    lng: rivi.lng,
    havainto: rivi.havainto,
    ehdotukset: JSON.parse(rivi.ehdotukset) as RtEhdotus[],
    aika: rivi.aika,
  };
}

/** Kaikki kuva-analyysit uusimmasta vanhimpaan, historianäkymää varten. */
export async function haeKuvat(db: D1Database): Promise<Kuva[]> {
  const { results } = await db
    .prepare("SELECT * FROM kuvat ORDER BY aika DESC")
    .all<KuvaRivi>();
  return results.map(kuvaRivista);
}

export interface UusiKuva {
  id: string;
  tekija: string;
  tiedostonimi: string;
  muistiinpano: string | null;
  lat: number | null;
  lng: number | null;
  havainto: string;
  ehdotukset: RtEhdotus[];
}

export async function lisaaKuva(db: D1Database, kuva: UusiKuva): Promise<Kuva> {
  const aika = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO kuvat (id, tekija, tiedostonimi, muistiinpano, lat, lng, havainto, ehdotukset, aika) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      kuva.id,
      kuva.tekija,
      kuva.tiedostonimi,
      kuva.muistiinpano,
      kuva.lat,
      kuva.lng,
      kuva.havainto,
      JSON.stringify(kuva.ehdotukset),
      aika,
    )
    .run();
  return { ...kuva, aika };
}
