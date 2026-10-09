import { paattelSisaltotyyppi } from "./r2.js";

/** Hakemistosta liitetyt metatiedot vahvistetulle RT-kortille (ks. index.ts:n varmistaRtKortit). */
export interface RtKorttiTiedot {
  tunnus: string;
  otsikko: string;
  tyyppi: string | null;
  julkaistu: string | null;
}

export interface RtEhdotus {
  aihe: string;
  rtKortti: string | null;
  /** Puuttuu vanhoilta analyyseilta, jotka tallennettiin ennen metatietojen liittämistä. */
  rtKorttiTiedot?: RtKorttiTiedot | null;
  lakipykala: string | null;
  kuvaus: string;
  /** Miten epäily varmistetaan paikan päällä. Puuttuu vanhoilta analyyseilta. */
  tarkastus?: string | null;
  varmuus: "korkea" | "keskitaso" | "matala";
}

export interface RtAnalyysi {
  havainto: string;
  ehdotukset: RtEhdotus[];
}

/**
 * "nopea" jättää hitaan kortin sisällönhakutyökalun pois käytöstä (vain nopea
 * D1-hakemistohaku sallittu) - vastaus muutamassa sekunnissa. "taydellinen"
 * sallii mallin myös hakea ja lukea koko kortin sisällön ennen vastaamista,
 * mikä voi lisätä kymmeniä sekunteja jos kortti ei ole vielä välimuistissa.
 */
export type AnalyysiTila = "nopea" | "taydellinen";

/** Mallin käytössä olevat apuvälineet RT-korttitunnuksen varmistamiseen kesken analyysin. */
export interface RtAnalyysiTyokalut {
  /** Nopea tunnus+nimi-haku hakemistosta (D1, ei ulkoista kutsua). */
  haeHakemistosta: (hakusana: string) => Promise<{ tunnus: string; otsikko: string; tyyppi: string | null }[]>;
  /** Hitaampi koko kortin tiivistelmän haku - kirjautuu tarvittaessa kortistoon. */
  haeKortinTiivistelma: (tunnus: string) => Promise<string | null>;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Haiku 4.5 kokeiltiin "nopea"-tilaan (~17 s), mutta se tulkitsi kuvia
// selvästi huonommin (mm. väärä tila -> väärä RT-kortti); Sonnet matalalla
// effortilla on hieman hitaampi mutta laadultaan lähes täydellisen veroinen.
const MALLI = "claude-sonnet-5";
const TYOKALU_NIMI = "kirjaa_rt_ehdotukset";
const HAKU_TYOKALU_NIMI = "hae_rt_kortteja_hakemistosta";
const SISALTO_TYOKALU_NIMI = "hae_rt_kortin_sisalto";
const EHDOTUSTEN_MAKSIMIMAARA = 8;
const MAKSIMI_KIERROKSET = 4;
const SISALTOHAKU_MAKSIMIMAARA = 2;

// Rakennustiedon RT-kortisto (https://kortistot.rakennustieto.fi/kortistot/rt-kortisto)
// kattaa satoja ohjekortteja rakentamisen eri osa-alueilta. Mallilla ei ole
// lakimieskoulutusta, joten lakipykälä annetaan tarkkana VAIN jos malli on siitä
// kohtuullisen varma. RT-korttitunnuksen osalta mallilla on sen sijaan käytössään
// hae_rt_kortteja_hakemistosta/hae_rt_kortin_sisalto-työkalut oikean kortiston
// tarkistamiseen kesken analyysin, ja worker/src/index.ts:n varmistaRtKortit
// nollaa tunnuksen joka tapauksessa jos se ei löydy hakemistosta - RT-korttitunnus
// ei siis koskaan pääse käyttäjälle asti hallusinoituna, vaikka malli unohtaisi
// käyttää työkaluja.
const KEHOTE_ALKU = `Olet rakennusalan asiantuntija-avustaja, joka auttaa käyttäjää \
arvioimaan mahdollisia rakennus- tai remonttivirheitä reklamaatiota varten. Käyttäjä \
lähettää kuvan kohteesta, ja tehtäväsi on etsiä kuvasta merkkejä virheellisestä tai \
puutteellisesta työstä (esim. väärä asennustapa, puuttuva vedeneristys, virheellinen \
kaltevuus, huono viimeistely) ja ehdottaa kuhunkin havaintoon:
- Rakennustiedon RT-kortiston (kortistot.rakennustieto.fi/kortistot/rt-kortisto) \
kohta, johon voi vedota siitä, miten työ olisi pitänyt tehdä.
- Suomen lainsäädännön kohta (esim. maankäyttö- ja rakennuslaki, kuluttajansuojalaki, \
asuntokauppalaki, urakkasopimusten yleiset sopimusehdot kuten YSE 1998), johon \
reklamaatiossa voisi vedota.`;

const KEHOTE_TYOKALUT_NOPEA = `Sinulla on käytössä yksi apuväline RT-korttitunnuksen \
varmistamiseen: ${HAKU_TYOKALU_NIMI} - nopea haku oikeiden RT-korttien tunnus+nimi-\
hakemistosta hakusanalla (esim. havaitun virheen aihepiiri). Käytä tätä AINA kun \
harkitset RT-korttitunnuksen ehdottamista, jotta annat vain oikeasti olemassa olevia \
tunnuksia etkä muistinvaraisesti keksittyjä.`;

const KEHOTE_TYOKALUT_TAYDELLINEN = `Sinulla on käytössä kaksi apuvälinettä RT-korttitunnuksen varmistamiseen:
- ${HAKU_TYOKALU_NIMI}: nopea haku oikeiden RT-korttien tunnus+nimi-hakemistosta \
hakusanalla (esim. havaitun virheen aihepiiri). Käytä tätä AINA kun harkitset \
RT-korttitunnuksen ehdottamista, jotta annat vain oikeasti olemassa olevia tunnuksia \
etkä muistinvaraisesti keksittyjä.
- ${SISALTO_TYOKALU_NIMI}: hakee yhden kortin tarkemman tiivistelmän tunnuksen \
perusteella, jos haluat varmistaa että kortti todella koskee havaitsemaasi virhettä \
ennen ehdotuksen kirjaamista. Tämä on hitaampi (voi kestää useita sekunteja) ja \
käytettävissä enintään ${SISALTOHAKU_MAKSIMIMAARA} kertaa per analyysi - käytä \
säästeliäästi, vain kun hakemistohaku ei yksin riitä varmistamaan osumaa.`;

const KEHOTE_LOPPU = `Jos et hakemistohaun jälkeenkään löydä oikeasti olemassa olevaa, osuvaa RT-korttia, \
jätä rtKortti-kenttä tyhjäksi äläkä keksi tunnusta ulkomuistista - tyhjä on aina \
parempi kuin väärä tai olematon tunnus.

Kun olet valmis, kutsu AINA lopuksi ${TYOKALU_NIMI}-työkalua näin:
- havainto: 1-2 lauseen kuvaus siitä, mitä kuvassa näkyy ja näkyykö siinä merkkejä \
rakennusvirheestä. Jos et näe mitään virheeseen viittaavaa, kerro se rehellisesti.
- ehdotukset: 0-6 havaittua virhettä tai epäilyä virheestä. Jos et löydä yhtään \
uskottavaa virhettä, palauta tyhjä lista äläkä keksi ongelmia vain täyttääksesi listaa. \
Kirjaa myös jokainen riskikohta, jota ei voi varmentaa pelkästä valokuvasta, omaksi \
ehdotuksekseen (matalalla varmuudella) — älä niputa niitä havainto-kenttään yleisellä \
maininnalla.
  - aihe: lyhyt kuvaus havaitusta virheestä tai riskikohdasta.
  - kuvaus: tarkempi selitys: mikä kuvassa tarkalleen herättää epäilyn, mitä kuvasta \
ei voi nähdä tai varmistaa, miksi se olisi virhe ja mitä seurauksia siitä voi olla.
  - tarkastus: miten epäily varmistetaan paikan päällä. Anna konkreettiset \
tarkastusmenetelmät ja -välineet (esim. pintakosteus- tai porareikämittaus, \
lämpökamera, vesikoe, rakenneavaus, mittaus vesivaa'alla tai rullamitalla, \
valmistajan asennusohjeen tai tuotehyväksynnän tarkistus, tarkastusasiakirjan tai \
käyttöönottopöytäkirjan pyytäminen), mikä tulos viittaa virheeseen ja kuka \
tarkastuksen voi tehdä (käyttäjä itse, kuntotarkastaja, sähkö- tai LVI-urakoitsija tms.).
  - rtKortti: tarkka, hakemistohaulla vahvistettu RT-korttitunnus ja mahdollinen \
kohta (esim. "RT 84-11093, kohta 3.2"), tai tyhjä merkkijono ("") jos et löytänyt \
vahvistettua osumaa.
  - lakipykala: tarkka laki ja pykälä (esim. "Kuluttajansuojalaki 8 luku 16 §") VAIN jos \
olet siitä kohtuullisen varma. Muuten kerro pelkkä lakialue sanallisesti kuvaus-kentässä \
ja jätä lakipykala-kenttä tyhjäksi merkkijonoksi ("") äläkä keksi pykälänumeroa.
  - varmuus: "korkea", "keskitaso" tai "matala" — arvioi rehellisesti. Älä nosta \
varmuutta keksimällä tarkempia tietoja kuin sinulla oikeasti on. Et ole lakimies eikä \
tämä ole sitovaa lakineuvontaa, joten ole erityisen varovainen lakipykälien kanssa.

Vastaa aina suomeksi. Jos kuvassa ei näy tunnistettavaa rakennus- tai remonttityötä \
lainkaan, kerro se havainto-kentässä ja palauta tyhjä ehdotukset-lista.`;

function rakennaSysteemikehote(tila: AnalyysiTila): string {
  const tyokaluOsio = tila === "taydellinen" ? KEHOTE_TYOKALUT_TAYDELLINEN : KEHOTE_TYOKALUT_NOPEA;
  return `${KEHOTE_ALKU}\n\n${tyokaluOsio}\n\n${KEHOTE_LOPPU}`;
}

interface AnthropicSisaltolohko {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
}

interface AnthropicVastaus {
  content: AnthropicSisaltolohko[];
  stop_reason?: string;
}

function siivoaEhdotus(raaka: unknown): RtEhdotus | null {
  if (typeof raaka !== "object" || raaka === null) return null;
  const { aihe, rtKortti, lakipykala, kuvaus, tarkastus, varmuus } = raaka as Record<string, unknown>;

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
    tarkastus: typeof tarkastus === "string" && tarkastus.trim().length > 0 ? tarkastus.trim() : null,
    varmuus: siistiVarmuus,
  };
}

const TYOKALU_KIRJAA = {
    name: TYOKALU_NIMI,
    description: "Kirjaa havainto kuvasta ja siihen mahdollisesti liittyvät rakennusvirheet reklamaatioperusteineen.",
    // strict: API validoi syötteen skeemaa vasten, jotta ehdotukset tulevat
    // aina omana taulukkonaan eivätkä tekstinä havainto-kentän sisällä.
    strict: true,
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
                description: "Hakemistohaulla vahvistettu tarkka RT-korttitunnus (ja kohta), tai tyhjä merkkijono.",
              },
              lakipykala: {
                type: "string",
                description: "Tarkka laki ja pykälä, tai tyhjä merkkijono jos ei varmuutta.",
              },
              kuvaus: { type: "string" },
              tarkastus: {
                type: "string",
                description: "Miten epäily varmistetaan paikan päällä: menetelmät, välineet, tulkinta ja tekijä.",
              },
              varmuus: { type: "string", enum: ["korkea", "keskitaso", "matala"] },
            },
            required: ["aihe", "rtKortti", "lakipykala", "kuvaus", "tarkastus", "varmuus"],
            additionalProperties: false,
          },
        },
      },
      required: ["havainto", "ehdotukset"],
      additionalProperties: false,
    },
  };

const TYOKALU_HAKU = {
  name: HAKU_TYOKALU_NIMI,
  description:
    "Hakee RT-korttien tunnus+nimi-hakemistosta. Anna 1-4 lyhyttä avainsanaa (esim. \"märkätila vedeneristys\") tai " +
    "korttitunnus; jokainen sana haetaan erikseen otsikoista. Palauttaa enintään 8 osumaa tyyppeineen, " +
    "ohje- ja säännöskortit ennen valmistajien tuotekortteja. Kokeile tarvittaessa uudelleen eri sanoilla.",
  input_schema: {
    type: "object",
    properties: { hakusana: { type: "string" } },
    required: ["hakusana"],
  },
};

const TYOKALU_SISALTO = {
  name: SISALTO_TYOKALU_NIMI,
  description: "Hakee yhden RT-kortin tiivistetyn sisällön tunnuksen perusteella. Hidas, käytä säästeliäästi.",
  input_schema: {
    type: "object",
    properties: { tunnus: { type: "string" } },
    required: ["tunnus"],
  },
};

function rakennaTyokalut(tila: AnalyysiTila) {
  return tila === "taydellinen"
    ? [TYOKALU_KIRJAA, TYOKALU_HAKU, TYOKALU_SISALTO]
    : [TYOKALU_KIRJAA, TYOKALU_HAKU];
}

async function kutsuAnthropic(
  apiAvain: string,
  messages: unknown[],
  tila: AnalyysiTila,
  pakotaLopullinenTyokalu: boolean,
): Promise<AnthropicVastaus> {
  const vastaus = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiAvain,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MALLI,
      // Malli käyttää osan budjetista ajatteluun ennen lopullista työkalukutsua;
      // 1500 katkaisi kirjauksen kesken niin, että ehdotukset-kenttä puuttui.
      max_tokens: 8000,
      system: rakennaSysteemikehote(tila),
      messages,
      tools: rakennaTyokalut(tila),
      // Malli ajattelee oletuksena (adaptive, effort "high"). "nopea"-tilassa
      // matala effort lyhentää ajattelua: mitattuna ~40 s -> ~25 s samalla
      // kuvalla ilman havaittavaa laadun laskua.
      ...(tila === "nopea" ? { output_config: { effort: "low" } } : {}),
      tool_choice: pakotaLopullinenTyokalu ? { type: "tool", name: TYOKALU_NIMI } : { type: "auto" },
    }),
  });

  if (!vastaus.ok) {
    const virheteksti = await vastaus.text().catch(() => "");
    throw new Error(`RT-analyysi epäonnistui (${vastaus.status}): ${virheteksti.slice(0, 300)}`);
  }
  return (await vastaus.json()) as AnthropicVastaus;
}

const VUOTANUT_MERKINTA_RE = /<\/havainto>|<\/?parameter\b/;
const VUOTANUT_EHDOTUKSET_RE = /<parameter name="ehdotukset">\s*(\[[\s\S]*\])/;

/**
 * Malli kirjoittaa joskus työkalukutsun parametrit tekstinä havainto-kentän
 * sisään ("…</havainto> <parameter name="ehdotukset">[…]"), jolloin varsinainen
 * ehdotukset-kenttä jää tyhjäksi. Erottaa tällöin havainnon ja poimii
 * ehdotukset tekstistä, jotta tunnistettuja virheitä ei hukata.
 */
export function korjaaVuotanutHavainto(
  havainto: string,
  ehdotukset: unknown,
): { havainto: string; ehdotukset: unknown } {
  const kohta = havainto.search(VUOTANUT_MERKINTA_RE);
  if (kohta === -1) return { havainto, ehdotukset };

  let poimitut: unknown = ehdotukset;
  const osuma = havainto.slice(kohta).match(VUOTANUT_EHDOTUKSET_RE);
  if (osuma && (!Array.isArray(ehdotukset) || ehdotukset.length === 0)) {
    try {
      poimitut = JSON.parse(osuma[1]);
    } catch {
      // Jäsentymätön loppuosa — pidetään alkuperäiset ehdotukset.
    }
  }
  return { havainto: havainto.slice(0, kohta), ehdotukset: poimitut };
}

function jasennaLopputulos(tyokaluKutsu: AnthropicSisaltolohko): RtAnalyysi {
  if (typeof tyokaluKutsu.input !== "object" || tyokaluKutsu.input === null) {
    throw new Error("RT-analyysi ei palauttanut tulosta");
  }
  const syote = tyokaluKutsu.input as Record<string, unknown>;
  if (typeof syote.havainto !== "string") {
    throw new Error("RT-analyysi ei palauttanut havaintoa");
  }
  const { havainto, ehdotukset } = korjaaVuotanutHavainto(syote.havainto, syote.ehdotukset);
  if (havainto.trim().length === 0) {
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

/**
 * Kutsuu Anthropic-API:a kuvan analysoimiseksi ja RT-korttien ehdottamiseksi.
 * Malli voi kesken analyysin kutsua hakemisto-/sisältöhakutyökaluja tarkistaakseen
 * oikean RT-kortin ennen lopullista vastausta (ks. RtAnalyysiTyokalut).
 */
export async function analysoiRemontti(
  apiAvain: string,
  kuva: { data: string; tiedostopaate: string },
  muistiinpano: string | null,
  tyokalut: RtAnalyysiTyokalut,
  tila: AnalyysiTila,
  aiempiAnalyysi: RtAnalyysi | null = null,
): Promise<RtAnalyysi> {
  const mediaType = paattelSisaltotyyppi(kuva.tiedostopaate);
  let kayttajaTeksti = muistiinpano
    ? `Käyttäjän lisätieto kuvasta: ${muistiinpano}`
    : "Käyttäjä ei antanut lisätietoa kuvasta.";
  if (aiempiAnalyysi) {
    // Täydellinen analyysi nopean jatkoksi: nopea tulos on lähtökohta, ei totuus.
    kayttajaTeksti +=
      "\n\nKuvasta on jo tehty nopea alustava analyysi (alla). Käytä sitä lähtökohtana: " +
      "tarkista sen havainnot ja RT-kortit, korjaa virheelliset, täydennä puuttuvat ja " +
      "pudota ne joita kuva ei tue. Älä kopioi sitä sellaisenaan.\n" +
      JSON.stringify(aiempiAnalyysi);
  }

  const messages: unknown[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: kuva.data } },
        { type: "text", text: kayttajaTeksti },
      ],
    },
  ];

  let sisaltohakujaJaljella = SISALTOHAKU_MAKSIMIMAARA;

  for (let kierros = 0; kierros < MAKSIMI_KIERROKSET; kierros++) {
    const pakotaLopullinen = kierros === MAKSIMI_KIERROKSET - 1;
    const vastaus = await kutsuAnthropic(apiAvain, messages, tila, pakotaLopullinen);

    const tyokaluKutsut = vastaus.content.filter((lohko) => lohko.type === "tool_use");
    const kirjausKutsu = tyokaluKutsut.find((k) => k.name === TYOKALU_NIMI);
    if (kirjausKutsu) {
      // Katkennut työkalukutsu voi olla jäsennettävä mutta vajaa (esim. ilman
      // ehdotuksia) — virhe on parempi kuin hiljaa tallennettu tyhjä analyysi.
      if (vastaus.stop_reason === "max_tokens") {
        throw new Error("RT-analyysin vastaus katkesi max_tokens-rajaan");
      }
      return jasennaLopputulos(kirjausKutsu);
    }

    if (tyokaluKutsut.length === 0) {
      // Malli vastasi pelkällä tekstillä kutsumatta yhtäkään työkalua - pakotetaan
      // seuraavalla kierroksella lopullinen työkalu (pakotaLopullinen kattaa tämän
      // viimeisellä kierroksella; välikierroksilla jatketaan silti keskustelua).
      messages.push({ role: "assistant", content: vastaus.content });
      messages.push({
        role: "user",
        content: [{ type: "text", text: `Kutsu ${TYOKALU_NIMI}-työkalua vastataksesi.` }],
      });
      continue;
    }

    messages.push({ role: "assistant", content: vastaus.content });

    const tulokset = await Promise.all(
      tyokaluKutsut.map(async (kutsu) => {
        const syote = (kutsu.input ?? {}) as Record<string, unknown>;
        let sisalto: string;
        if (kutsu.name === HAKU_TYOKALU_NIMI) {
          const hakusana = typeof syote.hakusana === "string" ? syote.hakusana : "";
          const osumat = await tyokalut.haeHakemistosta(hakusana);
          sisalto = JSON.stringify(osumat);
        } else if (kutsu.name === SISALTO_TYOKALU_NIMI) {
          if (sisaltohakujaJaljella <= 0) {
            sisalto = "Rajoitus: kortin sisältöä voi hakea vain rajallisen määrän kertoja per analyysi. Käytä jo saamiasi tietoja.";
          } else {
            sisaltohakujaJaljella--;
            const tunnus = typeof syote.tunnus === "string" ? syote.tunnus : "";
            const tiivistelma = await tyokalut.haeKortinTiivistelma(tunnus);
            sisalto = tiivistelma ?? "Korttia ei löytynyt hakemistosta tai sen sisältöä ei saatu haettua.";
          }
        } else {
          sisalto = "Tuntematon työkalu.";
        }
        return { type: "tool_result", tool_use_id: kutsu.id, content: sisalto };
      }),
    );
    messages.push({ role: "user", content: tulokset });
  }

  throw new Error("RT-analyysi ei palauttanut tulosta odotetussa ajassa");
}
