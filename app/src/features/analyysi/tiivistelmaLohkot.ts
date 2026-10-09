export type TiivistelmaLohko =
  | { tyyppi: "otsikko"; teksti: string }
  | { tyyppi: "kappale"; teksti: string }
  | { tyyppi: "lista"; kohdat: string[] };

// Tiivistelmän väliotsikot ovat isoilla kirjaimilla ja päättyvät kaksoispisteeseen
// (esim. "MITÄ KORTTI KÄSITTELEE:"); joskus otsikon perässä on tekstiä samalla rivillä.
const OTSIKKO_RE = /^([A-ZÅÄÖ][A-ZÅÄÖ0-9 ,/()-]{2,}):\s*(.*)$/;
const LISTA_RE = /^\s*[-•*]\s+(.*)$/;

// Otsikko voi olla myös omalla rivillään ilman kaksoispistettä ("MITÄ KORTTI KÄSITTELEE").
const KOKO_RIVI_OTSIKKO_RE = /^[A-ZÅÄÖ][A-ZÅÄÖ0-9 ,/()-]+$/;

function onOtsikko(rivi: string): { otsikko: string; loput: string } | null {
  // Kaksoispisteen on tultava heti isojen kirjainten perään, ettei esim.
  // "RT RakMK-21756 / YM:n asetus…" tulkitu otsikoksi.
  const osuma = rivi.match(OTSIKKO_RE);
  if (osuma && osuma[1].trim().length >= 4) return { otsikko: osuma[1].trim(), loput: osuma[2] };
  // Pelkkä tunnus ("RT 91-11259") ei ole otsikko — vaaditaan oikea sana.
  if (KOKO_RIVI_OTSIKKO_RE.test(rivi) && /[A-ZÅÄÖ]{4,}/.test(rivi)) return { otsikko: rivi, loput: "" };
  return null;
}

/**
 * Jäsentää RT-kortin tiivistelmän (tavallinen teksti rivinvaihtoineen)
 * otsikoiksi, kappaleiksi ja luetteloiksi, jotta se on luettava eikä
 * yhtenä tekstimassana.
 */
export function jasennaTiivistelma(teksti: string): TiivistelmaLohko[] {
  const lohkot: TiivistelmaLohko[] = [];
  for (const raakaRivi of teksti.split(/\r?\n/)) {
    const rivi = raakaRivi.trim();
    if (rivi.length === 0) continue;

    const lista = rivi.match(LISTA_RE);
    if (lista) {
      const edellinen = lohkot[lohkot.length - 1];
      if (edellinen?.tyyppi === "lista") edellinen.kohdat.push(lista[1]);
      else lohkot.push({ tyyppi: "lista", kohdat: [lista[1]] });
      continue;
    }

    const otsikko = onOtsikko(rivi);
    if (otsikko) {
      lohkot.push({ tyyppi: "otsikko", teksti: otsikko.otsikko });
      if (otsikko.loput) lohkot.push({ tyyppi: "kappale", teksti: otsikko.loput });
      continue;
    }

    lohkot.push({ tyyppi: "kappale", teksti: rivi });
  }
  return lohkot;
}
