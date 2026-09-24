const AVAIN = "rt-reclamator.tekijan-nimi";

/**
 * Muistaa viimeksi käytetyn tekijän nimimerkin tällä laitteella, jotta sitä
 * ei tarvitse kirjoittaa joka kuvalla uudelleen ja jotta "omat kuvat"
 * -suodatus historianäkymässä voi käyttää sitä. Sovelluksella ei ole
 * käyttäjätilejä/rekisteröitymistä eikä sellaista ole tarkoitus lisätä tätä
 * varten — pelkkä laitekohtainen muisti riittää.
 */
export function haeTekijanNimi(): string {
  try {
    return window.localStorage.getItem(AVAIN) ?? "";
  } catch {
    return "";
  }
}

export function tallennaTekijanNimi(nimi: string): void {
  try {
    window.localStorage.setItem(AVAIN, nimi);
  } catch {
    // Hiljainen epäonnistuminen (esim. yksityinen selaus) — nimeä ei silloin muisteta.
  }
}
