export type Varmuus = "korkea" | "keskitaso" | "matala";

export interface RtEhdotus {
  aihe: string;
  rtKortti: string | null;
  lakipykala: string | null;
  kuvaus: string;
  varmuus: Varmuus;
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
