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
  aika: string;
}
