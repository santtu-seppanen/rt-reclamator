import type { RtEhdotus } from "./rtAnalyysi.js";
import type { HakemistoKortti } from "./rtKortisto.js";

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

export interface RtKorttiCache {
  tunnus: string;
  otsikko: string;
  tiivistelma: string;
  haettuAika: string;
}

interface RtKorttiRivi {
  tunnus: string;
  otsikko: string;
  tiivistelma: string;
  haettu_aika: string;
}

/** Välimuistiin tallennettu RT-kortin tiivistelmä, jos kortti on jo kerran haettu. */
export async function haeRtKortti(db: D1Database, tunnus: string): Promise<RtKorttiCache | null> {
  const rivi = await db
    .prepare("SELECT * FROM rt_kortit WHERE tunnus = ?")
    .bind(tunnus)
    .first<RtKorttiRivi>();
  if (!rivi) return null;
  return {
    tunnus: rivi.tunnus,
    otsikko: rivi.otsikko,
    tiivistelma: rivi.tiivistelma,
    haettuAika: rivi.haettu_aika,
  };
}

export async function tallennaRtKortti(
  db: D1Database,
  tunnus: string,
  otsikko: string,
  tiivistelma: string,
): Promise<RtKorttiCache> {
  const haettuAika = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO rt_kortit (tunnus, otsikko, tiivistelma, haettu_aika) VALUES (?, ?, ?, ?)
       ON CONFLICT(tunnus) DO UPDATE SET otsikko = excluded.otsikko, tiivistelma = excluded.tiivistelma, haettu_aika = excluded.haettu_aika`,
    )
    .bind(tunnus, otsikko, tiivistelma, haettuAika)
    .run();
  return { tunnus, otsikko, tiivistelma, haettuAika };
}

/**
 * Hakemisto kaikkien oikeasti olemassa olevien RT-korttien tunnuksista
 * (ks. worker/src/rtKortisto.ts:n haeHakemistoSivu). Käytetään validoimaan
 * ettei mallin /analysoi:ssa ehdottama RT-korttitunnus ole hallusinoitu.
 */
export async function tallennaHakemistoRivit(db: D1Database, rivit: HakemistoKortti[]): Promise<void> {
  if (rivit.length === 0) return;
  const paivitetty = new Date().toISOString();
  const lausekkeet = rivit.map((r) =>
    db
      .prepare(
        `INSERT INTO rt_kortti_hakemisto (tunnus, otsikko, tyyppi, julkaistu, content_id, paivitetty)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tunnus) DO UPDATE SET
           otsikko = excluded.otsikko,
           tyyppi = excluded.tyyppi,
           julkaistu = excluded.julkaistu,
           content_id = excluded.content_id,
           paivitetty = excluded.paivitetty`,
      )
      .bind(r.tunnus, r.otsikko, r.tyyppi, r.julkaistu, r.contentId, paivitetty),
  );
  await db.batch(lausekkeet);
}

export interface HakemistoHakutulos {
  tunnus: string;
  otsikko: string;
}

/** Nopea tunnus+nimi-haku hakemistosta — malli käyttää tätä kesken /analysoi:ta (ks. rtAnalyysi.ts). */
export async function hakemistohaku(db: D1Database, hakusana: string, raja = 8): Promise<HakemistoHakutulos[]> {
  const kysely = `%${hakusana}%`;
  const { results } = await db
    .prepare("SELECT tunnus, otsikko FROM rt_kortti_hakemisto WHERE tunnus LIKE ?1 OR otsikko LIKE ?1 LIMIT ?2")
    .bind(kysely, raja)
    .all<HakemistoHakutulos>();
  return results;
}

/** Onko tunnus oikeasti olemassa hakemistossa (eli kortistossa) — käytetään hallusinaatiosuodatukseen. */
export async function onkoRtKorttiHakemistossa(db: D1Database, tunnus: string): Promise<boolean> {
  const rivi = await db.prepare("SELECT 1 FROM rt_kortti_hakemisto WHERE tunnus = ?").bind(tunnus).first();
  return rivi !== null;
}

export async function hakemistonKoko(db: D1Database): Promise<number> {
  const rivi = await db.prepare("SELECT COUNT(*) AS maara FROM rt_kortti_hakemisto").first<{ maara: number }>();
  return rivi?.maara ?? 0;
}
