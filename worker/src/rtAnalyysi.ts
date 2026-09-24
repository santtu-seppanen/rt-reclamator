import { paattelSisaltotyyppi } from "./r2.js";

export interface RtEhdotus {
  aihe: string;
  rtKortti: string | null;
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
// hakea kortistoa reaaliaikaisesti, joten mallia pyydetään antamaan tarkka
// korttitunnus vain jos se on siitä kohtuullisen varma — muuten pelkkä
// aihepiiri sanallisesti ja rehellinen matala varmuus. Näin sovellus ei
// esitä keksittyjä korttinumeroita faktoina.
const SYSTEEMIKEHOTE = `Olet rakennusalan asiantuntija-avustaja. Käyttäjä lähettää kuvan \
remontti- tai rakennuskohteesta, ja tehtäväsi on auttaa tunnistamaan, mitkä \
Rakennustiedon RT-kortiston (kortistot.rakennustieto.fi/kortistot/rt-kortisto) \
kortit tai aihepiirit liittyvät kuvassa näkyvään työhön. RT-kortisto sisältää \
ohjekortteja mm. rakennusosista, talotekniikasta, pintarakenteista, \
korjausrakentamisesta ja työmaakäytännöistä.

Tarkastele kuvaa ja käyttäjän mahdollista lisätietoa, ja kutsu työkalua näin:
- havainto: 1-2 lauseen kuvaus siitä, mitä remontti-/rakennustyötä kuvassa näkyy.
- ehdotukset: 2-6 relevanttia RT-korttia tai aihepiiriä.
  - rtKortti: tarkka korttitunnus (esim. "RT 84-11093") VAIN jos olet siitä \
kohtuullisen varma yleistiedon perusteella. Muuten jätä tyhjäksi merkkijonoksi \
("") äläkä keksi numeroa.
  - aihe ja kuvaus: aihepiiri sanallisesti aina, vaikka tarkkaa korttia ei annettaisi.
  - varmuus: "korkea", "keskitaso" tai "matala" — arvioi rehellisesti. Älä \
nosta varmuutta keksimällä tarkempia tietoja kuin sinulla oikeasti on.

Vastaa aina suomeksi. Jos kuvassa ei näy tunnistettavaa rakennus- tai \
remonttityötä, kerro se havainto-kentässä ja palauta tyhjä ehdotukset-lista.`;

interface AnthropicSisaltolohko {
  type: string;
  input?: unknown;
}

interface AnthropicVastaus {
  content: AnthropicSisaltolohko[];
}

function siivoaEhdotus(raaka: unknown): RtEhdotus | null {
  if (typeof raaka !== "object" || raaka === null) return null;
  const { aihe, rtKortti, kuvaus, varmuus } = raaka as Record<string, unknown>;

  if (typeof aihe !== "string" || aihe.trim().length === 0) return null;
  if (typeof kuvaus !== "string" || kuvaus.trim().length === 0) return null;

  const siistiRtKortti = typeof rtKortti === "string" && rtKortti.trim().length > 0
    ? rtKortti.trim()
    : null;

  const varmuusArvot = new Set(["korkea", "keskitaso", "matala"]);
  const siistiVarmuus = typeof varmuus === "string" && varmuusArvot.has(varmuus)
    ? (varmuus as RtEhdotus["varmuus"])
    : "matala";

  return { aihe: aihe.trim(), rtKortti: siistiRtKortti, kuvaus: kuvaus.trim(), varmuus: siistiVarmuus };
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
          description: "Kirjaa havainto remonttikuvasta ja siihen sopivat RT-kortit/aihepiirit.",
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
                      description: "Tarkka RT-korttitunnus, tai tyhjä merkkijono jos ei varmuutta.",
                    },
                    kuvaus: { type: "string" },
                    varmuus: { type: "string", enum: ["korkea", "keskitaso", "matala"] },
                  },
                  required: ["aihe", "rtKortti", "kuvaus", "varmuus"],
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
