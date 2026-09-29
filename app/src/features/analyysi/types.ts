export type Varmuus = "korkea" | "keskitaso" | "matala";

export interface RtEhdotus {
  aihe: string;
  rtKortti: string | null;
  lakipykala: string | null;
  kuvaus: string;
  varmuus: Varmuus;
}

/** RT-kortin tiivistetty sisältö, haettu ja tiivistetty kortistosta (ks. GET /rt-kortti). */
export interface RtKorttiVastaus {
  tunnus: string;
  otsikko: string;
  tiivistelma: string;
  haettuAika: string;
}

/** Yksi lähetetty kuva ja siihen saadut rakennusvirhe-/reklamaatioehdotukset. */
export interface Analyysi {
  id: string;
  tekija: string;
  tiedostonimi: string;
  muistiinpano: string | null;
  lat: number | null;
  lng: number | null;
  havainto: string;
  ehdotukset: RtEhdotus[];
  /** null vanhoilla analyyseilla, jotka tallennettiin ennen tilan tallentamista. */
  tila: "nopea" | "taydellinen" | null;
  aika: string;
}

export type PalauteArvio = "hyva" | "huono";

export interface ReklamaatioPyynto {
  kuvaId: string;
  /** Mitkä analyysin ehdotukset (indeksit) otetaan reklamaatioon. */
  ehdotusIndeksit: number[];
  lisatieto: string | null;
  tekija: string | null;
}

/** Tekoälyn kirjoittama reklamaatioluonnos (ks. POST /reklamaatio). */
export interface Reklamaatio extends ReklamaatioPyynto {
  id: string;
  teksti: string;
  aika: string;
}

/**
 * Käyttäjän palaute reklamaatioluonnoksesta (ehdotusIndeksi null) tai
 * yhdestä siihen valitusta ehdotuksesta.
 */
export interface PalautePyynto {
  reklamaatioId: string;
  ehdotusIndeksi: number | null;
  arvio: PalauteArvio | null;
  kommentti: string | null;
  /** Käyttäjän muokkaama reklamaatioteksti, jos se poikkeaa luonnoksesta. */
  muokattuTeksti: string | null;
  tekija: string | null;
}
