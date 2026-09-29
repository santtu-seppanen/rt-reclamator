import { bytesToBase64 } from "./base64.js";

const BASE = "https://kortistot.rakennustieto.fi";
const AUTH_BASE = "https://auth.rakennustieto.fi";
const USER_AGENT = "rt-reclamator-worker/1.0";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MALLI = "claude-sonnet-5";
const TYOKALU_NIMI = "kirjaa_rt_kortti_tiivistelma";

// Evästeet per isäntänimi - kirjautuminen hyppää usean eri
// (kortistot|auth|sso).rakennustieto.fi-alidomainin välillä.
type Evasteet = Record<string, Map<string, string>>;

function paivitaEvasteet(evasteet: Evasteet, host: string, vastaus: Response): void {
  const setCookieOtsakkeet =
    typeof vastaus.headers.getSetCookie === "function"
      ? vastaus.headers.getSetCookie()
      : (vastaus.headers.get("set-cookie")?.split(/,(?=[^;]+?=)/) ?? []);

  if (setCookieOtsakkeet.length === 0) return;
  const kartta = evasteet[host] ?? new Map<string, string>();
  for (const raaka of setCookieOtsakkeet) {
    const pari = raaka.split(";")[0];
    const yhtasuuruusKohta = pari.indexOf("=");
    if (yhtasuuruusKohta === -1) continue;
    kartta.set(pari.slice(0, yhtasuuruusKohta).trim(), pari.slice(yhtasuuruusKohta + 1).trim());
  }
  evasteet[host] = kartta;
}

function evasteOtsake(evasteet: Evasteet, host: string): string | null {
  const kartta = evasteet[host];
  if (!kartta || kartta.size === 0) return null;
  return [...kartta.entries()].map(([nimi, arvo]) => `${nimi}=${arvo}`).join("; ");
}

/**
 * Kirjautumisketju hyppää useiden uudelleenohjausten läpi eri
 * alidomainien välillä (NextAuth -> AWS Cognito -> Rakennustieto-UAA).
 * fetch():in oma redirect:"follow" ei säilytä evästeitä eri isäntien
 * välillä, joten ohjaukset seurataan käsin.
 */
async function seuraaUudelleenohjaukset(
  aloitusUrl: string,
  evasteet: Evasteet,
  alkuAsetukset: RequestInit,
): Promise<{ vastaus: Response; lopullinenUrl: string }> {
  let url = aloitusUrl;
  let asetukset = alkuAsetukset;

  for (let hyppy = 0; hyppy < 15; hyppy++) {
    const host = new URL(url).host;
    const otsakkeet = new Headers(asetukset.headers);
    otsakkeet.set("User-Agent", USER_AGENT);
    // Accept: text/html on pakollinen - ilman sitä UAA/Cognito-kirjautumisketju
    // tulkitsee pyynnön API-kutsuksi ja vastaa 401:llä lomakkeen näyttämisen sijaan.
    otsakkeet.set("Accept", "text/html,application/xhtml+xml");
    const evaste = evasteOtsake(evasteet, host);
    if (evaste) otsakkeet.set("Cookie", evaste);

    const vastaus = await fetch(url, { ...asetukset, headers: otsakkeet, redirect: "manual" });
    paivitaEvasteet(evasteet, host, vastaus);

    if ([301, 302, 303, 307, 308].includes(vastaus.status)) {
      const sijainti = vastaus.headers.get("Location");
      if (!sijainti) return { vastaus, lopullinenUrl: url };
      url = new URL(sijainti, url).toString();
      // 301/302/303: pudota body ja siirry GET:iin (kuten selaimet/urllib) -
      // vain ensimmäinen POST (signin-käynnistys) tarvitsee bodyn.
      asetukset = vastaus.status === 307 || vastaus.status === 308 ? asetukset : { method: "GET" };
      continue;
    }
    return { vastaus, lopullinenUrl: url };
  }
  throw new Error("liikaa uudelleenohjauksia kirjautumisessa");
}

/** Kirjautuu Rakennustiedon SSO:hon. Palauttaa evästevaraston jota käytetään myöhemmissä pyynnöissä. */
export async function kirjaudu(kayttajatunnus: string, salasana: string): Promise<Evasteet> {
  const evasteet: Evasteet = {};

  const { vastaus: csrfVastaus } = await seuraaUudelleenohjaukset(`${BASE}/api/auth/csrf`, evasteet, {
    method: "GET",
  });
  const { csrfToken } = (await csrfVastaus.json()) as { csrfToken: string };

  const signinBody = new URLSearchParams({ csrfToken, callbackUrl: BASE }).toString();
  const { vastaus: loginSivu, lopullinenUrl } = await seuraaUudelleenohjaukset(
    `${BASE}/api/auth/signin/RT-old`,
    evasteet,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: signinBody,
    },
  );

  if (!lopullinenUrl.startsWith(`${AUTH_BASE}/login`)) {
    throw new Error(`odottamaton uudelleenohjaus kirjautumisessa (${lopullinenUrl})`);
  }
  const loginHtml = await loginSivu.text();

  // Sivulla on kolme lomaketta (tunnus/salasana, AD-sähköposti, IP-kirjautuminen) -
  // poimitaan nimenomaan tunnus/salasana-lomakkeen _csrf.
  const csrfMatch = loginHtml.match(
    /<form action="\/login" method="post"><input type="hidden" name="_csrf" value="([^"]+)"\/>[\s\S]*?name="username"[\s\S]*?name="password"/,
  );
  if (!csrfMatch) {
    throw new Error("kirjautumislomaketta ei löytynyt - sivuston kirjautuminen on saattanut muuttua");
  }
  const uaaCsrf = csrfMatch[1];

  const loginBody = new URLSearchParams({
    _csrf: uaaCsrf,
    username: kayttajatunnus,
    password: salasana,
  }).toString();
  await seuraaUudelleenohjaukset(`${AUTH_BASE}/login`, evasteet, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: loginBody,
  });

  const { vastaus: sessioVastaus } = await seuraaUudelleenohjaukset(`${BASE}/api/auth/session`, evasteet, {
    method: "GET",
  });
  const sessio = (await sessioVastaus.json()) as Record<string, unknown>;
  if (!sessio || Object.keys(sessio).length === 0) {
    throw new Error("väärä käyttäjätunnus tai salasana");
  }
  return evasteet;
}

// Hakutulossivu on Next.js-SSR-sivu: tulosdata ei tule erillisestä API-kutsusta
// vaan on upotettuna sivun mukana tulevaan React Server Component -streamiin
// (script self.__next_f.push([...])-kutsuina). Tämä poimii sieltä "initialSearchData"-JSONin.
const NEXT_F_RE = /self\.__next_f\.push\(\[1,"(.*?)"\]\)\s*<\/script>/gs;

interface HakutulosKortti {
  CardReferenceCode?: string;
  ProductName?: string;
  contentId?: string | number;
  ProductType?: string;
  PublicationDate?: string;
}

interface Hakutulossivu {
  products: HakutulosKortti[];
  pagination: { total_count: number; pages_count: number; page: number };
}

function poimiHakudata(html: string): Hakutulossivu | null {
  for (const osuma of html.matchAll(NEXT_F_RE)) {
    const raaka = osuma[1];
    if (!raaka.includes("initialSearchData")) continue;
    let dekoodattu: string;
    try {
      dekoodattu = JSON.parse(`"${raaka}"`) as string;
    } catch {
      continue;
    }
    const alku = dekoodattu.indexOf('{"products"');
    if (alku === -1) continue;
    let syvyys = 0;
    let loppu = -1;
    for (let i = alku; i < dekoodattu.length; i++) {
      if (dekoodattu[i] === "{") syvyys++;
      else if (dekoodattu[i] === "}") {
        syvyys--;
        if (syvyys === 0) {
          loppu = i + 1;
          break;
        }
      }
    }
    if (loppu === -1) continue;
    try {
      return JSON.parse(dekoodattu.slice(alku, loppu)) as Hakutulossivu;
    } catch {
      continue;
    }
  }
  return null;
}

async function haeHakutulossivu(evasteet: Evasteet, kysely: string, sivu: number): Promise<Hakutulossivu | null> {
  const hakuUrl = `${BASE}/search?q=${encodeURIComponent(kysely)}&page=${sivu}`;
  const { vastaus } = await seuraaUudelleenohjaukset(hakuUrl, evasteet, { method: "GET" });
  return poimiHakudata(await vastaus.text());
}

export interface HakemistoKortti {
  tunnus: string;
  otsikko: string;
  tyyppi: string | null;
  julkaistu: string | null;
  contentId: string | null;
}

export interface HakemistoSivu {
  kortit: HakemistoKortti[];
  sivu: number;
  sivujaYhteensa: number;
}

/**
 * Hakee yhden sivullisen koko kortiston hakutuloksia laajalla "*"-haulla ja
 * suodattaa siitä RT-alkuiset kortit (haku kattaa myös Ratu/KH/RYL-kortit).
 * Käytetään hakemiston rakentamiseen, jotta mallin ehdottamat RT-tunnukset
 * voidaan tarkistaa oikeaa kortistoa vasten eikä koskaan näytetä
 * hallusinoitua tunnusta todellisena.
 */
export async function haeHakemistoSivu(evasteet: Evasteet, sivu: number): Promise<HakemistoSivu> {
  const data = await haeHakutulossivu(evasteet, "*", sivu);
  if (!data) {
    throw new Error("hakemistosivua ei voitu lukea - sivuston hakutulosrakenne on saattanut muuttua");
  }
  const kortit = data.products
    .filter((p): p is HakutulosKortti & { CardReferenceCode: string } =>
      (p.CardReferenceCode ?? "").startsWith("RT "),
    )
    .map((p) => ({
      tunnus: p.CardReferenceCode,
      otsikko: p.ProductName ?? p.CardReferenceCode,
      tyyppi: p.ProductType ?? null,
      julkaistu: p.PublicationDate ?? null,
      contentId: p.contentId != null ? String(p.contentId) : null,
    }));
  return { kortit, sivu: data.pagination.page, sivujaYhteensa: data.pagination.pages_count };
}

export interface RtKortinSisalto {
  otsikko: string;
  pdfTavut: Uint8Array;
}

/** Hakee yhden kortin PDF-sisällön tunnuksen (esim. "RT 85-11253") perusteella. */
export async function haeKortinSisalto(evasteet: Evasteet, tunnus: string): Promise<RtKortinSisalto | null> {
  const data = await haeHakutulossivu(evasteet, tunnus, 1);
  const osuma = data?.products.find((p) => p.CardReferenceCode === tunnus);
  if (!osuma || !osuma.contentId) return null;

  const { vastaus: pdfVastaus } = await seuraaUudelleenohjaukset(`${BASE}/api/content/${osuma.contentId}`, evasteet, {
    method: "GET",
  });
  if (!pdfVastaus.ok || !(pdfVastaus.headers.get("Content-Type") ?? "").toLowerCase().includes("pdf")) {
    return null;
  }
  const pdfTavut = new Uint8Array(await pdfVastaus.arrayBuffer());
  return { otsikko: osuma.ProductName ?? tunnus, pdfTavut };
}

interface AnthropicSisaltolohko {
  type: string;
  input?: unknown;
}

interface AnthropicVastaus {
  content: AnthropicSisaltolohko[];
}

/** Tiivistää RT-kortin PDF-sisällön Anthropic-API:lla lyhyeksi suomenkieliseksi yhteenvedoksi. */
export async function tiivistaRtKortti(
  apiAvain: string,
  tunnus: string,
  otsikko: string,
  pdfTavut: Uint8Array,
): Promise<string> {
  const vastaus = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiAvain,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MALLI,
      max_tokens: 4096,
      system:
        "Olet rakennusalan asiantuntija-avustaja. Tiivistä annettu RT-kortti suomeksi lyhyeksi, " +
        "käytännölliseksi yhteenvedoksi: mitä kortti käsittelee, mitkä ovat sen keskeiset " +
        "vaatimukset tai ohjeet, ja millaisessa tilanteessa siihen kannattaa vedota reklamaatiossa. " +
        "Älä keksi sisältöä jota kortissa ei ole.",
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytesToBase64(pdfTavut) } },
            { type: "text", text: `Tiivistä RT-kortti ${tunnus} (${otsikko}).` },
          ],
        },
      ],
      tools: [
        {
          name: TYOKALU_NIMI,
          description: "Kirjaa RT-kortin tiivistelmä.",
          input_schema: {
            type: "object",
            properties: { tiivistelma: { type: "string" } },
            required: ["tiivistelma"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TYOKALU_NIMI },
    }),
  });

  if (!vastaus.ok) {
    const virheteksti = await vastaus.text().catch(() => "");
    throw new Error(`RT-kortin tiivistys epäonnistui (${vastaus.status}): ${virheteksti.slice(0, 300)}`);
  }

  const data = (await vastaus.json()) as AnthropicVastaus;
  const tyokaluKutsu = data.content.find((lohko) => lohko.type === "tool_use");
  if (!tyokaluKutsu || typeof tyokaluKutsu.input !== "object" || tyokaluKutsu.input === null) {
    throw new Error("RT-kortin tiivistys ei palauttanut tulosta");
  }
  const { tiivistelma } = tyokaluKutsu.input as Record<string, unknown>;
  if (typeof tiivistelma !== "string" || tiivistelma.trim().length === 0) {
    throw new Error("RT-kortin tiivistys palautti tyhjän tuloksen");
  }
  return tiivistelma.trim();
}
