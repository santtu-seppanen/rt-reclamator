import type { Analyysi, PalautePyynto, Reklamaatio, ReklamaatioPyynto, RtKorttiVastaus } from "./types";

/** Hakee kaikki aiemmat kuva-analyysit Cloudflare Workerista (D1-tietokanta), historianäkymää varten. */
export async function haeAnalyysit(): Promise<Analyysi[]> {
  const url = `${import.meta.env.VITE_API_URL}/analyysit`;

  const vastaus = await fetch(url);

  if (!vastaus.ok) {
    throw new Error("Analyysien haku epäonnistui");
  }

  return (await vastaus.json()) as Analyysi[];
}

export interface AnalysoiPyynto {
  tekija: string;
  muistiinpano: string | null;
  lat: number | null;
  lng: number | null;
  kuva: {
    tiedostopaate: string;
    data: string;
  };
  tila: "nopea" | "taydellinen";
}

/**
 * Lähettää remonttikuvan Cloudflare Workeriin, joka pyytää siihen
 * RT-korttiehdotukset Anthropic-API:sta ja tallentaa kuvan + analyysin
 * (ks. worker/). Palauttaa heti valmiin analyysin, ilman erillistä hakua.
 */
export async function analysoiKuva(pyynto: AnalysoiPyynto): Promise<Analyysi> {
  const url = `${import.meta.env.VITE_API_URL}/analysoi`;

  const vastaus = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Jaettu-Salasana": import.meta.env.VITE_JAETTU_SALASANA,
    },
    body: JSON.stringify(pyynto),
  });

  const data = (await vastaus.json().catch(() => null)) as
    | Analyysi
    | { error: string }
    | null;

  if (!vastaus.ok || !data || "error" in data) {
    const virhe = data && "error" in data ? data.error : "Analyysi epäonnistui";
    throw new Error(virhe);
  }

  return data;
}

/**
 * Hakee ja tiivistää oikean RT-kortin sisällön kortistosta annetulla
 * tunnuksella (esim. "RT 85-11253"). Worker välimuistittaa vastauksen
 * D1:een, mutta yksittäinen haku voi silti kestää hetken (PDF-haku +
 * tiivistys Anthropic-API:lla ensimmäisellä kerralla).
 */
export async function haeRtKortinSisalto(tunnus: string): Promise<RtKorttiVastaus> {
  const url = `${import.meta.env.VITE_API_URL}/rt-kortti?tunnus=${encodeURIComponent(tunnus)}`;

  const vastaus = await fetch(url, {
    headers: {
      "X-Jaettu-Salasana": import.meta.env.VITE_JAETTU_SALASANA,
    },
  });

  const data = (await vastaus.json().catch(() => null)) as
    | RtKorttiVastaus
    | { error: string }
    | null;

  if (!vastaus.ok || !data || "error" in data) {
    const virhe = data && "error" in data ? data.error : "Kortin haku epäonnistui";
    throw new Error(virhe);
  }

  return data;
}

/**
 * Pyytää Workerilta (POST /reklamaatio) tekoälyn kirjoittaman
 * reklamaatioluonnoksen valituista ehdotuksista.
 */
export async function kirjoitaReklamaatio(pyynto: ReklamaatioPyynto): Promise<Reklamaatio> {
  const url = `${import.meta.env.VITE_API_URL}/reklamaatio`;

  const vastaus = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Jaettu-Salasana": import.meta.env.VITE_JAETTU_SALASANA,
    },
    body: JSON.stringify(pyynto),
  });

  const data = (await vastaus.json().catch(() => null)) as
    | Reklamaatio
    | { error: string }
    | null;

  if (!vastaus.ok || !data || "error" in data) {
    const virhe = data && "error" in data ? data.error : "Reklamaation kirjoitus epäonnistui";
    throw new Error(virhe);
  }

  return data;
}

/**
 * Lähettää käyttäjän palautteen reklamaatioluonnoksesta Workeriin
 * (POST /palaute). Palaute kerätään tekoälyn ohjeistuksen
 * (worker/src/rtAnalyysi.ts, worker/src/reklamaatio.ts) parantamiseen.
 */
export async function lahetaPalaute(pyynto: PalautePyynto): Promise<void> {
  const url = `${import.meta.env.VITE_API_URL}/palaute`;

  const vastaus = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Jaettu-Salasana": import.meta.env.VITE_JAETTU_SALASANA,
    },
    body: JSON.stringify(pyynto),
  });

  if (!vastaus.ok) {
    const data = (await vastaus.json().catch(() => null)) as { error: string } | null;
    throw new Error(data?.error ?? "Palautteen lähetys epäonnistui");
  }
}
