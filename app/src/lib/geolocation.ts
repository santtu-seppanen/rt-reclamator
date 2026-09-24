export interface Sijainti {
  lat: number;
  lng: number;
  tarkkuusMetreina: number;
  aikaleima: number;
}

export type SijaintiVirhe = {
  koodi: "EI_TUETTU" | "LUPA_EVATTY" | "AIKAKATKAISU" | "MUU";
  viesti: string;
};

/**
 * Kertahaku selaimen getCurrentPosition-rajapinnalla. Sijainti tallennetaan
 * vain kuvan metatietona (ks. CLAUDE.md) — sovellus ei seuraa sijaintia
 * jatkuvasti eikä tee etäisyyspäättelyä sen perusteella.
 */
export function haeNykyinenSijaintiKerran(): Promise<Sijainti> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject({ koodi: "EI_TUETTU", viesti: "Selain ei tue sijaintirajapintaa" } satisfies SijaintiVirhe);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          tarkkuusMetreina: position.coords.accuracy,
          aikaleima: position.timestamp,
        });
      },
      (error) => {
        const koodi =
          error.code === error.PERMISSION_DENIED
            ? "LUPA_EVATTY"
            : error.code === error.TIMEOUT
              ? "AIKAKATKAISU"
              : "MUU";
        reject({ koodi, viesti: error.message } satisfies SijaintiVirhe);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
  });
}
