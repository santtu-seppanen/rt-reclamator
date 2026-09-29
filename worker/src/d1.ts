import type { RtEhdotus, AnalyysiTila } from "./rtAnalyysi.js";
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
  /** null vanhoilla riveillä, jotka tallennettiin ennen tilan tallentamista. */
  tila: AnalyysiTila | null;
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
  tila: string | null;
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
    tila: rivi.tila as AnalyysiTila | null,
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

/** Yksittäinen kuva-analyysi id:llä, esim. palautteen kohteen tarkistamiseen. */
export async function haeKuvaIdlla(db: D1Database, id: string): Promise<Kuva | null> {
  const rivi = await db.prepare("SELECT * FROM kuvat WHERE id = ?").bind(id).first<KuvaRivi>();
  return rivi ? kuvaRivista(rivi) : null;
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
  tila: AnalyysiTila;
}

export async function lisaaKuva(db: D1Database, kuva: UusiKuva): Promise<Kuva> {
  const aika = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO kuvat (id, tekija, tiedostonimi, muistiinpano, lat, lng, havainto, ehdotukset, tila, aika) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      kuva.tila,
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

export interface UusiReklamaatio {
  kuvaId: string;
  ehdotusIndeksit: number[];
  lisatieto: string | null;
  teksti: string;
  tekija: string | null;
}

export interface Reklamaatio extends UusiReklamaatio {
  id: string;
  aika: string;
}

interface ReklamaatioRivi {
  id: string;
  kuva_id: string;
  ehdotus_indeksit: string;
  lisatieto: string | null;
  teksti: string;
  tekija: string | null;
  aika: string;
}

export async function lisaaReklamaatio(db: D1Database, reklamaatio: UusiReklamaatio): Promise<Reklamaatio> {
  const id = crypto.randomUUID();
  const aika = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO reklamaatiot (id, kuva_id, ehdotus_indeksit, lisatieto, teksti, tekija, aika) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      reklamaatio.kuvaId,
      JSON.stringify(reklamaatio.ehdotusIndeksit),
      reklamaatio.lisatieto,
      reklamaatio.teksti,
      reklamaatio.tekija,
      aika,
    )
    .run();
  return { ...reklamaatio, id, aika };
}

export async function haeReklamaatio(db: D1Database, id: string): Promise<Reklamaatio | null> {
  const rivi = await db.prepare("SELECT * FROM reklamaatiot WHERE id = ?").bind(id).first<ReklamaatioRivi>();
  if (!rivi) return null;
  return {
    id: rivi.id,
    kuvaId: rivi.kuva_id,
    ehdotusIndeksit: JSON.parse(rivi.ehdotus_indeksit) as number[],
    lisatieto: rivi.lisatieto,
    teksti: rivi.teksti,
    tekija: rivi.tekija,
    aika: rivi.aika,
  };
}

export type PalauteArvio = "hyva" | "huono";

export interface UusiPalaute {
  reklamaatioId: string;
  ehdotusIndeksi: number | null;
  arvio: PalauteArvio | null;
  kommentti: string | null;
  muokattuTeksti: string | null;
  tekija: string | null;
}

export interface Palaute extends UusiPalaute {
  id: string;
  aika: string;
}

export async function lisaaPalaute(db: D1Database, palaute: UusiPalaute): Promise<Palaute> {
  const id = crypto.randomUUID();
  const aika = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO palaute (id, reklamaatio_id, ehdotus_indeksi, arvio, kommentti, muokattu_teksti, tekija, aika) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      palaute.reklamaatioId,
      palaute.ehdotusIndeksi,
      palaute.arvio,
      palaute.kommentti,
      palaute.muokattuTeksti,
      palaute.tekija,
      aika,
    )
    .run();
  return { ...palaute, id, aika };
}

/**
 * Palaute yhdistettynä reklamaatioluonnokseen ja analyysiin joita se koskee
 * — kaikki mitä tarvitaan rtAnalyysi.ts:n ja reklamaatio.ts:n kehotteiden
 * parantamiseen yhdellä haulla.
 */
export interface PalauteKontekstilla extends Palaute {
  reklamaatio: {
    teksti: string;
    lisatieto: string | null;
    ehdotusIndeksit: number[];
  };
  analyysi: {
    kuvaId: string;
    tiedostonimi: string;
    muistiinpano: string | null;
    havainto: string;
    tila: AnalyysiTila | null;
    /** Arvioitu ehdotus, tai null jos palaute koskee koko reklamaatiota. */
    ehdotus: RtEhdotus | null;
    ehdotukset: RtEhdotus[];
  };
}

interface PalauteLiitosRivi {
  id: string;
  reklamaatio_id: string;
  ehdotus_indeksi: number | null;
  arvio: PalauteArvio | null;
  kommentti: string | null;
  muokattu_teksti: string | null;
  tekija: string | null;
  aika: string;
  reklamaatio_teksti: string;
  reklamaatio_lisatieto: string | null;
  ehdotus_indeksit: string;
  kuva_id: string;
  tiedostonimi: string;
  muistiinpano: string | null;
  havainto: string;
  ehdotukset: string;
  tila: string | null;
}

/** Kaikki palautteet uusimmasta vanhimpaan, valinnaisesti vain tietyllä arviolla. */
export async function haePalautteet(db: D1Database, arvio: PalauteArvio | null): Promise<PalauteKontekstilla[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.reklamaatio_id, p.ehdotus_indeksi, p.arvio, p.kommentti, p.muokattu_teksti, p.tekija, p.aika,
              r.teksti AS reklamaatio_teksti, r.lisatieto AS reklamaatio_lisatieto, r.ehdotus_indeksit,
              k.id AS kuva_id, k.tiedostonimi, k.muistiinpano, k.havainto, k.ehdotukset, k.tila
       FROM palaute p
       JOIN reklamaatiot r ON r.id = p.reklamaatio_id
       JOIN kuvat k ON k.id = r.kuva_id
       WHERE ?1 IS NULL OR p.arvio = ?1
       ORDER BY p.aika DESC`,
    )
    .bind(arvio)
    .all<PalauteLiitosRivi>();

  return results.map((r) => {
    const ehdotukset = JSON.parse(r.ehdotukset) as RtEhdotus[];
    return {
      id: r.id,
      reklamaatioId: r.reklamaatio_id,
      ehdotusIndeksi: r.ehdotus_indeksi,
      arvio: r.arvio,
      kommentti: r.kommentti,
      muokattuTeksti: r.muokattu_teksti,
      tekija: r.tekija,
      aika: r.aika,
      reklamaatio: {
        teksti: r.reklamaatio_teksti,
        lisatieto: r.reklamaatio_lisatieto,
        ehdotusIndeksit: JSON.parse(r.ehdotus_indeksit) as number[],
      },
      analyysi: {
        kuvaId: r.kuva_id,
        tiedostonimi: r.tiedostonimi,
        muistiinpano: r.muistiinpano,
        havainto: r.havainto,
        tila: r.tila as AnalyysiTila | null,
        ehdotus: r.ehdotus_indeksi === null ? null : (ehdotukset[r.ehdotus_indeksi] ?? null),
        ehdotukset,
      },
    };
  });
}
