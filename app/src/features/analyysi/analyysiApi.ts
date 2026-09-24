import type { Analyysi } from "./types";

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
