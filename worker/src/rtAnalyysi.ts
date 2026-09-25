import { paattelSisaltotyyppi } from "./r2.js";

export interface RtEhdotus {
  aihe: string;
  rtKortti: string | null;
  lakipykala: string | null;
  kuvaus: string;
  varmuus: "korkea" | "keskitaso" | "matala";
}

export interface RtAnalyysi {
  havainto: string;
  ehdotukset: RtEhdotus[];
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MALLI = "claude-sonnet-5";
const TYOKALU_NIMI = "kirjaa_rt_ehdotukset";
const EHDOTUSTEN_MAKSIMIMAARA = 8;

// Rakennustiedon RT-kortisto (https://kortistot.rakennustieto.fi/kortistot/rt-kortisto)
// kattaa satoja ohjekortteja rakentamisen eri osa-alueilta. Worker ei voi
// hakea kortistoa reaaliaikaisesti eikä mallilla ole lakimieskoulutusta, joten
// sekä RT-korttitunnus että lakipykälä annetaan tarkkana VAIN jos malli on
// niistä kohtuullisen varma — muuten pelkkä aihepiiri/lakialue sanallisesti ja
// rehellinen matala varmuus. Näin sovellus ei esitä keksittyjä korttinumeroita
// tai pykäliä faktoina eikä anna sitovaa lakineuvontaa.
const SYSTEEMIKEHOTE = `Olet rakennusalan asiantuntija-avustaja, joka auttaa käyttäjää \
arvioimaan mahdollisia rakennus- tai remonttivirheitä reklamaatiota varten. Käyttäjä \
lähettää kuvan kohteesta, ja tehtäväsi on etsiä kuvasta merkkejä virheellisestä tai \
puutteellisesta työstä (esim. väärä asennustapa, puuttuva vedeneristys, virheellinen \
kaltevuus, huono viimeistely) ja ehdottaa kuhunkin havaintoon:
- Rakennustiedon RT-kortiston (kortistot.rakennustieto.fi/kortistot/rt-kortisto) \
kohta, johon voi vedota siitä, miten työ olisi pitänyt tehdä.
- Suomen lainsäädännön kohta (esim. maankäyttö- ja rakennuslaki, kuluttajansuojalaki, \
asuntokauppalaki, urakkasopimusten yleiset sopimusehdot kuten YSE 1998), johon \
reklamaatiossa voisi vedota.

Tarkastele kuvaa ja käyttäjän mahdollista lisätietoa, ja kutsu työkalua näin:
- havainto: 1-2 lauseen kuvaus siitä, mitä kuvassa näkyy ja näkyykö siinä merkkejä \
rakennusvirheestä. Jos et näe mitään virheeseen viittaavaa, kerro se rehellisesti.
- ehdotukset: 0-6 havaittua virhettä tai epäilyä virheestä. Jos et löydä yhtään \
uskottavaa virhettä, palauta tyhjä lista äläkä keksi ongelmia vain täyttääksesi listaa.
  - aihe: lyhyt kuvaus havaitusta virheestä.
  - kuvaus: tarkempi selitys siitä, miksi tämä on todennäköisesti virhe ja mitä \
seurauksia siitä voi olla.
  - rtKortti: tarkka RT-korttitunnus ja mahdollinen kohta (esim. "RT 84-11093, kohta 3.2") \
VAIN jos olet siitä kohtuullisen varma yleistiedon perusteella. Muuten jätä tyhjäksi \
merkkijonoksi ("") äläkä keksi tunnusta.
  - lakipykala: tarkka laki ja pykälä (esim. "Kuluttajansuojalaki 8 luku 16 §") VAIN jos \
olet siitä kohtuullisen varma. Muuten kerro pelkkä lakialue sanallisesti kuvaus-kentässä \
ja jätä lakipykala-kenttä tyhjäksi merkkijonoksi ("") äläkä keksi pykälänumeroa.
  - varmuus: "korkea", "keskitaso" tai "matala" — arvioi rehellisesti. Älä nosta \
varmuutta keksimällä tarkempia tietoja kuin sinulla oikeasti on. Et ole lakimies eikä \
tämä ole sitovaa lakineuvontaa, joten ole erityisen varovainen lakipykälien kanssa.

Vastaa aina suomeksi. Jos kuvassa ei näy tunnistettavaa rakennus- tai remonttityötä \
lainkaan, kerro se havainto-kentässä ja palauta tyhjä ehdotukset-lista.`;

interface AnthropicSisaltolohko {
  type: string;
  input?: unknown;
}

interface AnthropicVastaus {
  content: AnthropicSisaltolohko[];
}

function siivoaEhdotus(raaka: unknown): RtEhdotus | null {
  if (typeof raaka !== "object" || raaka === null) return null;
  const { aihe, rtKortti, lakipykala, kuvaus, varmuus } = raaka as Record<string, unknown>;

  if (typeof aihe !== "string" || aihe.trim().length === 0) return null;
  if (typeof kuvaus !== "string" || kuvaus.trim().length === 0) return null;

  const siistiRtKortti = typeof rtKortti === "string" && rtKortti.trim().length > 0
    ? rtKortti.trim()
    : null;

  const siistiLakipykala = typeof lakipykala === "string" && lakipykala.trim().length > 0
    ? lakipykala.trim()
    : null;

  const varmuusArvot = new Set(["korkea", "keskitaso", "matala"]);
  const siistiVarmuus = typeof varmuus === "string" && varmuusArvot.has(varmuus)
    ? (varmuus as RtEhdotus["varmuus"])
    : "matala";

  return {
    aihe: aihe.trim(),
    rtKortti: siistiRtKortti,
    lakipykala: siistiLakipykala,
    kuvaus: kuvaus.trim(),
    varmuus: siistiVarmuus,
  };
}

/** Kutsuu Anthropic-API:a kuvan analysoimiseksi ja RT-korttien ehdottamiseksi. */
export async function analysoiRemontti(
  apiAvain: string,
  kuva: { data: string; tiedostopaate: string },
  muistiinpano: string | null,
): Promise<RtAnalyysi> {
  const mediaType = paattelSisaltotyyppi(kuva.tiedostopaate);
  const kayttajaTeksti = muistiinpano
    ? `Käyttäjän lisätieto kuvasta: ${muistiinpano}`
    : "Käyttäjä ei antanut lisätietoa kuvasta.";

  const vastaus = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiAvain,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MALLI,
      max_tokens: 1500,
      system: SYSTEEMIKEHOTE,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: kuva.data } },
            { type: "text", text: kayttajaTeksti },
          ],
        },
      ],
      tools: [
        {
          name: TYOKALU_NIMI,
          description: "Kirjaa havainto kuvasta ja siihen mahdollisesti liittyvät rakennusvirheet reklamaatioperusteineen.",
          input_schema: {
            type: "object",
            properties: {
              havainto: { type: "string" },
              ehdotukset: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    aihe: { type: "string" },
                    rtKortti: {
                      type: "string",
                      description: "Tarkka RT-korttitunnus (ja kohta), tai tyhjä merkkijono jos ei varmuutta.",
                    },
                    lakipykala: {
                      type: "string",
                      description: "Tarkka laki ja pykälä, tai tyhjä merkkijono jos ei varmuutta.",
                    },
                    kuvaus: { type: "string" },
                    varmuus: { type: "string", enum: ["korkea", "keskitaso", "matala"] },
                  },
                  required: ["aihe", "rtKortti", "lakipykala", "kuvaus", "varmuus"],
                },
              },
            },
            required: ["havainto", "ehdotukset"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TYOKALU_NIMI },
    }),
  });

  if (!vastaus.ok) {
    const virheteksti = await vastaus.text().catch(() => "");
    throw new Error(`RT-analyysi epäonnistui (${vastaus.status}): ${virheteksti.slice(0, 300)}`);
  }

  const data = (await vastaus.json()) as AnthropicVastaus;
  const tyokaluKutsu = data.content.find((lohko) => lohko.type === "tool_use");
  if (!tyokaluKutsu || typeof tyokaluKutsu.input !== "object" || tyokaluKutsu.input === null) {
    throw new Error("RT-analyysi ei palauttanut tulosta");
  }

  const { havainto, ehdotukset } = tyokaluKutsu.input as Record<string, unknown>;
  if (typeof havainto !== "string" || havainto.trim().length === 0) {
    throw new Error("RT-analyysi ei palauttanut havaintoa");
  }

  const siivotutEhdotukset = Array.isArray(ehdotukset)
    ? ehdotukset
        .map(siivoaEhdotus)
        .filter((e): e is RtEhdotus => e !== null)
        .slice(0, EHDOTUSTEN_MAKSIMIMAARA)
    : [];

  return { havainto: havainto.trim(), ehdotukset: siivotutEhdotukset };
}
