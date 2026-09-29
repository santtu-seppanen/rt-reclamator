import type { RtEhdotus } from "./rtAnalyysi.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MALLI = "claude-sonnet-5";
const TYOKALU_NIMI = "kirjaa_reklamaatio";

// Luonnos rakentuu VAIN analyysin jo tuottamista ehdotuksista (joiden
// RT-korttitunnukset on varmistettu hakemistoa vasten, ks. index.ts:n
// varmistaRtKortit) — mallia kielletään lisäämästä uusia RT-kortteja tai
// lakipykäliä, jotta luonnokseen ei pääse hallusinoituja viitteitä.
// Tuntemattomat faktat (nimet, päivämäärät, sopimusnumerot) jätetään
// hakasulkeisiin paikkamerkeiksi eikä niitä keksitä.
const SYSTEEMIKEHOTE = `Olet rakennusalan asiantuntija-avustaja, joka kirjoittaa \
suomenkielisen reklamaatioluonnoksen rakennus- tai remonttivirheestä. Saat kuva-analyysin \
havainnon, käyttäjän valitsemat virhe-ehdotukset (aihe, kuvaus, RT-kortti, lakipykälä, \
varmuus) sekä käyttäjän mahdolliset lisätiedot.

Kirjoita asiallinen, kohtelias mutta selkeä reklamaatio urakoitsijalle tai myyjälle:
- Otsikkorivi (esim. "Reklamaatio: ...").
- Vastaanottaja, lähettäjä, kohteen osoite ja päiväys. Jos niitä ei ole annettu \
lisätiedoissa, jätä hakasulkeisiin paikkamerkki (esim. [Urakoitsijan nimi], \
[Kohteen osoite], [Päivämäärä]). ÄLÄ KOSKAAN keksi nimiä, osoitteita, päivämääriä, \
sopimusnumeroita tai summia.
- Kuvaus havaituista virheistä, yksi kohta per ehdotus.
- Viittaukset: käytä VAIN ehdotuksissa annettuja RT-kortteja ja lakipykäliä, sellaisenaan. \
Älä lisää muita RT-kortteja tai pykäliä. Jos ehdotuksessa ei ole RT-korttia tai \
lakipykälää, älä keksi sellaista — kuvaa vaatimus sanallisesti. Jos ehdotuksen varmuus \
on "matala", muotoile kohta varauksellisesti (esim. "vaikuttaa siltä", "pyydämme \
selvittämään").
- Vaatimus: virheiden korjaaminen kohtuullisessa määräajassa [määräaika] ja \
kirjallinen vastaus.
- Lopuksi yhteystiedot ja allekirjoitus paikkamerkkeinä.

Älä lisää luonnokseen omia huomautuksia tai selityksiä sen ulkopuolelle — palauta vain \
itse reklamaatioteksti ${TYOKALU_NIMI}-työkalulla. Et ole lakimies eikä luonnos ole \
lakineuvontaa; käyttäjä tarkistaa ja muokkaa sen ennen lähettämistä.`;

export interface ReklamaatioSyote {
  havainto: string;
  muistiinpano: string | null;
  ehdotukset: RtEhdotus[];
  lisatieto: string | null;
  /** Välimuistissa jo olevat RT-korttien tiivistelmät tunnuksittain (ei haeta uusia). */
  korttienTiivistelmat: Record<string, string>;
}

interface AnthropicVastaus {
  content: { type: string; input?: unknown }[];
}

function muotoileSyote(syote: ReklamaatioSyote): string {
  const ehdotukset = syote.ehdotukset
    .map((e, i) => {
      const rivit = [
        `${i + 1}. ${e.aihe}`,
        `   Kuvaus: ${e.kuvaus}`,
        `   RT-kortti: ${e.rtKortti ?? "(ei)"}`,
        `   Lakipykälä: ${e.lakipykala ?? "(ei)"}`,
        `   Varmuus: ${e.varmuus}`,
      ];
      const tiivistelma = e.rtKortti ? syote.korttienTiivistelmat[e.rtKortti.split(",")[0].trim()] : undefined;
      if (tiivistelma) rivit.push(`   RT-kortin tiivistelmä: ${tiivistelma}`);
      return rivit.join("\n");
    })
    .join("\n\n");

  return [
    `Kuva-analyysin havainto: ${syote.havainto}`,
    `Käyttäjän lisätieto kuvasta: ${syote.muistiinpano ?? "(ei)"}`,
    `Käyttäjän lisätiedot reklamaatioon: ${syote.lisatieto ?? "(ei)"}`,
    `Reklamaatioon valitut virheet:\n${ehdotukset}`,
  ].join("\n\n");
}

/** Kirjoittaa reklamaatioluonnoksen valituista ehdotuksista Anthropic-API:lla. */
export async function kirjoitaReklamaatio(apiAvain: string, syote: ReklamaatioSyote): Promise<string> {
  const vastaus = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiAvain,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MALLI,
      max_tokens: 3000,
      system: SYSTEEMIKEHOTE,
      messages: [{ role: "user", content: muotoileSyote(syote) }],
      tools: [
        {
          name: TYOKALU_NIMI,
          description: "Kirjaa valmis reklamaatioluonnos.",
          input_schema: {
            type: "object",
            properties: { teksti: { type: "string" } },
            required: ["teksti"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TYOKALU_NIMI },
    }),
  });

  if (!vastaus.ok) {
    const virheteksti = await vastaus.text().catch(() => "");
    throw new Error(`Reklamaation kirjoitus epäonnistui (${vastaus.status}): ${virheteksti.slice(0, 300)}`);
  }

  const data = (await vastaus.json()) as AnthropicVastaus;
  const tyokaluKutsu = data.content.find((lohko) => lohko.type === "tool_use");
  const teksti =
    tyokaluKutsu && typeof tyokaluKutsu.input === "object" && tyokaluKutsu.input !== null
      ? (tyokaluKutsu.input as Record<string, unknown>).teksti
      : undefined;
  if (typeof teksti !== "string" || teksti.trim().length === 0) {
    throw new Error("Reklamaation kirjoitus palautti tyhjän tuloksen");
  }
  return teksti.trim();
}
