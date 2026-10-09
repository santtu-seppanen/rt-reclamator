import {
  haeKuvat,
  lisaaKuva,
  haeRtKortti,
  tallennaRtKortti,
  tallennaHakemistoRivit,
  haeHakemistoKortti,
  hakemistonKoko,
  hakemistohaku,
  haeKuvaIdlla,
  lisaaPalaute,
  haePalautteet,
  lisaaReklamaatio,
  haeReklamaatio,
} from "./d1.js";
import type { Kuva, PalauteArvio } from "./d1.js";
import { haeKuva, tallennaKuva, haeRtPdf, tallennaRtPdf } from "./r2.js";
import { bytesToBase64 } from "./base64.js";
import { validoiAnalysoiPyynto, validoiPalautePyynto, validoiReklamaatioPyynto } from "./validointi.js";
import { kirjoitaReklamaatio } from "./reklamaatio.js";
import { analysoiRemontti } from "./rtAnalyysi.js";
import type { RtEhdotus, RtAnalyysiTyokalut } from "./rtAnalyysi.js";
import { kirjaudu, haeKortinPdf, tiivistaRtKortti, haeHakemistoSivu } from "./rtKortisto.js";

interface Env {
  DB: D1Database;
  KUVAT: R2Bucket;
  JAETTU_SALASANA: string;
  ANTHROPIC_API_KEY: string;
  RAKENNUSTIETO_USERNAME: string;
  RAKENNUSTIETO_PASSWORD: string;
  CORS_ORIGIN: string;
}

const KUVAT_POLKU_ETULIITE = "/kuvat/";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Jaettu-Salasana",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/analyysit") {
      const kuvat = await haeKuvat(env.DB);
      return jsonVastaus(kuvat, 200, corsHeaders);
    }

    if (request.method === "GET" && url.pathname.startsWith(KUVAT_POLKU_ETULIITE)) {
      return kasitteleKuva(url.pathname.slice(KUVAT_POLKU_ETULIITE.length), env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/analysoi") {
      return kasitteleAnalysoi(request, env, corsHeaders);
    }

    if (request.method === "GET" && url.pathname === "/rt-kortti/pdf") {
      return kasitteleRtKortinPdf(request, url, env, corsHeaders);
    }

    if (request.method === "GET" && url.pathname === "/rt-kortti") {
      return kasitteleRtKortti(request, url, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/rt-kortti-hakemisto/paivita") {
      return kasitteleHakemistonPaivitys(request, url, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/reklamaatio") {
      return kasitteleReklamaatio(request, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/palaute") {
      return kasittelePalaute(request, env, corsHeaders);
    }

    if (request.method === "GET" && url.pathname === "/palaute") {
      return kasittelePalautteidenHaku(request, url, env, corsHeaders);
    }

    return jsonVastaus({ error: "Reittiä ei löydy" }, 404, corsHeaders);
  },
};

async function kasitteleKuva(
  tiedostonimi: string,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Kuva-avaimissa ei ole "/"-merkkiä; samassa bucketissa olevat RT-kortti-PDF:t
  // (rt-kortit/…) eivät saa olla haettavissa tätä julkista reittiä pitkin.
  if (tiedostonimi.includes("/")) {
    return jsonVastaus({ error: "Kuvaa ei löydy" }, 404, corsHeaders);
  }
  const objekti = await haeKuva(env.KUVAT, tiedostonimi);
  if (!objekti) {
    return jsonVastaus({ error: "Kuvaa ei löydy" }, 404, corsHeaders);
  }

  return new Response(objekti.body, {
    status: 200,
    headers: {
      "Content-Type": objekti.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      ...corsHeaders,
    },
  });
}

/**
 * Ottaa vastaan remonttikuvan, pyytää siihen RT-korttiehdotukset
 * Anthropic-API:sta, ja tallentaa kuvan (R2) sekä analyysin (D1).
 * Palauttaa koko tallennetun rivin, jotta frontend saa ehdotukset heti
 * ilman erillistä hakua.
 */
async function kasitteleAnalysoi(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.headers.get("X-Jaettu-Salasana") !== env.JAETTU_SALASANA) {
    return jsonVastaus({ error: "Virheellinen salasana" }, 401, corsHeaders);
  }

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return jsonVastaus({ error: "Virheellinen JSON" }, 400, corsHeaders);
  }

  const tulos = validoiAnalysoiPyynto(data);
  if (!tulos.ok) {
    return jsonVastaus({ error: tulos.virhe }, 400, corsHeaders);
  }

  const { pyynto } = tulos;

  // Täydellinen analyysi nopean jatkoksi: kuva, lisätieto ja sijainti luetaan
  // pohja-analyysista eikä kuvaa ladata eikä tallenneta uudelleen.
  let pohja: Kuva | null = null;
  let kuvaSyote = pyynto.kuva;
  if (pyynto.pohjaAnalyysiId) {
    pohja = await haeKuvaIdlla(env.DB, pyynto.pohjaAnalyysiId);
    const objekti = pohja ? await haeKuva(env.KUVAT, pohja.tiedostonimi) : null;
    if (!pohja || !objekti) {
      return jsonVastaus({ error: "Pohja-analyysia ei löydy" }, 404, corsHeaders);
    }
    kuvaSyote = {
      data: bytesToBase64(new Uint8Array(await objekti.arrayBuffer())),
      tiedostopaate: pohja.tiedostonimi.split(".").pop() ?? "jpg",
    };
  }
  if (!kuvaSyote) {
    return jsonVastaus({ error: "kuva on pakollinen" }, 400, corsHeaders);
  }
  const muistiinpano = pohja ? pohja.muistiinpano : pyynto.muistiinpano;

  const tyokalut: RtAnalyysiTyokalut = {
    haeHakemistosta: (hakusana) => hakemistohaku(env.DB, hakusana),
    haeKortinTiivistelma: async (tunnus) => {
      try {
        const rivi = await haeTaiTiivistaKortti(env, tunnus.split(",")[0].trim());
        return rivi?.tiivistelma ?? null;
      } catch (virhe) {
        console.error("hae_rt_kortin_sisalto epäonnistui:", virhe);
        return null;
      }
    },
  };

  let analyysi;
  try {
    analyysi = await analysoiRemontti(
      env.ANTHROPIC_API_KEY,
      kuvaSyote,
      muistiinpano,
      tyokalut,
      pyynto.tila,
      pohja ? { havainto: pohja.havainto, ehdotukset: pohja.ehdotukset } : null,
    );
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "RT-analyysi epäonnistui. Yritä uudelleen." }, 502, corsHeaders);
  }

  analyysi = { ...analyysi, ehdotukset: await varmistaRtKortit(env.DB, analyysi.ehdotukset) };

  const id = crypto.randomUUID();
  // Uusi rivi viittaa samaan R2-kuvaan kuin pohja-analyysi.
  const tiedostonimi = pohja ? pohja.tiedostonimi : `${id}.${kuvaSyote.tiedostopaate}`;

  try {
    if (!pohja) await tallennaKuva(env.KUVAT, tiedostonimi, kuvaSyote.data);
    const kuva = await lisaaKuva(env.DB, {
      id,
      tekija: pyynto.tekija,
      tiedostonimi,
      muistiinpano,
      lat: pohja ? pohja.lat : pyynto.lat,
      lng: pohja ? pohja.lng : pyynto.lng,
      havainto: analyysi.havainto,
      ehdotukset: analyysi.ehdotukset,
      tila: pyynto.tila,
    });
    return jsonVastaus(kuva, 201, corsHeaders);
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "Tallennus epäonnistui" }, 502, corsHeaders);
  }
}

/**
 * Kirjoittaa reklamaatioluonnoksen käyttäjän valitsemista ehdotuksista
 * Anthropic-API:lla (ks. reklamaatio.ts) ja tallentaa sen, jotta
 * myöhempi palaute (POST /palaute) voidaan sitoa juuri tähän luonnokseen.
 */
async function kasitteleReklamaatio(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.headers.get("X-Jaettu-Salasana") !== env.JAETTU_SALASANA) {
    return jsonVastaus({ error: "Virheellinen salasana" }, 401, corsHeaders);
  }

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return jsonVastaus({ error: "Virheellinen JSON" }, 400, corsHeaders);
  }

  const tulos = validoiReklamaatioPyynto(data);
  if (!tulos.ok) {
    return jsonVastaus({ error: tulos.virhe }, 400, corsHeaders);
  }

  const { pyynto } = tulos;
  const kuva = await haeKuvaIdlla(env.DB, pyynto.kuvaId);
  if (!kuva) {
    return jsonVastaus({ error: "Analyysia ei löydy" }, 404, corsHeaders);
  }
  if (pyynto.ehdotusIndeksit.some((i) => i >= kuva.ehdotukset.length)) {
    return jsonVastaus({ error: "ehdotusIndeksit eivät osu analyysin ehdotuksiin" }, 400, corsHeaders);
  }

  const valitut = pyynto.ehdotusIndeksit.map((i) => kuva.ehdotukset[i]);

  // Vain jo välimuistissa olevat korttitiivistelmät — ei kirjauduta
  // kortistoon tämän takia, ettei luonnoksen kirjoitus hidastu.
  const korttienTiivistelmat: Record<string, string> = {};
  for (const ehdotus of valitut) {
    if (!ehdotus.rtKortti) continue;
    const tunnus = ehdotus.rtKortti.split(",")[0].trim();
    const kortti = await haeRtKortti(env.DB, tunnus);
    if (kortti) korttienTiivistelmat[tunnus] = kortti.tiivistelma;
  }

  let teksti: string;
  try {
    teksti = await kirjoitaReklamaatio(env.ANTHROPIC_API_KEY, {
      havainto: kuva.havainto,
      muistiinpano: kuva.muistiinpano,
      ehdotukset: valitut,
      lisatieto: pyynto.lisatieto,
      korttienTiivistelmat,
    });
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "Reklamaation kirjoitus epäonnistui. Yritä uudelleen." }, 502, corsHeaders);
  }

  const reklamaatio = await lisaaReklamaatio(env.DB, { ...pyynto, teksti });
  return jsonVastaus(reklamaatio, 201, corsHeaders);
}

/**
 * Tallentaa käyttäjän palautteen reklamaatioluonnoksesta tai yhdestä siihen
 * valitusta ehdotuksesta. Palautetta käytetään rtAnalyysi.ts:n ja
 * reklamaatio.ts:n kehotteiden parantamiseen (ks. GET /palaute) — se ei
 * vaikuta mitenkään jo tallennettuun analyysiin tai luonnokseen.
 */
async function kasittelePalaute(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.headers.get("X-Jaettu-Salasana") !== env.JAETTU_SALASANA) {
    return jsonVastaus({ error: "Virheellinen salasana" }, 401, corsHeaders);
  }

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return jsonVastaus({ error: "Virheellinen JSON" }, 400, corsHeaders);
  }

  const tulos = validoiPalautePyynto(data);
  if (!tulos.ok) {
    return jsonVastaus({ error: tulos.virhe }, 400, corsHeaders);
  }

  const { pyynto } = tulos;
  const reklamaatio = await haeReklamaatio(env.DB, pyynto.reklamaatioId);
  if (!reklamaatio) {
    return jsonVastaus({ error: "Reklamaatiota ei löydy" }, 404, corsHeaders);
  }
  if (pyynto.ehdotusIndeksi !== null && !reklamaatio.ehdotusIndeksit.includes(pyynto.ehdotusIndeksi)) {
    return jsonVastaus({ error: "ehdotusIndeksi ei ole reklamaatioon valittu ehdotus" }, 400, corsHeaders);
  }

  const palaute = await lisaaPalaute(env.DB, pyynto);
  return jsonVastaus(palaute, 201, corsHeaders);
}

/**
 * Kaikki palautteet yhdistettynä reklamaatioluonnokseen ja analyysiin joita
 * ne koskevat — kehittäjän työkalu kehotteiden parantamiseen,
 * ei frontendin käytössä. Valinnainen ?arvio=huono|hyva suodattaa.
 */
async function kasittelePalautteidenHaku(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.headers.get("X-Jaettu-Salasana") !== env.JAETTU_SALASANA) {
    return jsonVastaus({ error: "Virheellinen salasana" }, 401, corsHeaders);
  }

  const arvioParametri = url.searchParams.get("arvio");
  let arvio: PalauteArvio | null = null;
  if (arvioParametri === "hyva" || arvioParametri === "huono") {
    arvio = arvioParametri;
  } else if (arvioParametri !== null) {
    return jsonVastaus({ error: 'arvio täytyy olla "hyva" tai "huono"' }, 400, corsHeaders);
  }

  const palautteet = await haePalautteet(env.DB, arvio);
  return jsonVastaus(palautteet, 200, corsHeaders);
}

/**
 * Tarkistaa jokaisen ehdotuksen rtKortti-tunnuksen rt_kortti_hakemisto-taulua
 * vasten (ks. GET /rt-kortti-hakemisto/paivita) ja tyhjentää sen jos tunnusta
 * ei löydy oikeasta kortistosta — malli ei saa koskaan näyttää hallusinoitua
 * RT-korttinumeroa todellisena. Löytyneen kortin metatiedot (otsikko, tyyppi,
 * julkaisuaika) liitetään samalla haulla ehdotukseen, jolloin ne tallentuvat
 * analyysin mukana eikä frontendin tarvitse hakea niitä erikseen. Malli
 * saattaa liittää tunnukseen pilkulla erotetun kohdan (esim. "RT 84-11093,
 * kohta 3.2"), joten vain pilkkua edeltävä osa tarkistetaan.
 */
async function varmistaRtKortit(db: D1Database, ehdotukset: RtEhdotus[]): Promise<RtEhdotus[]> {
  return Promise.all(
    ehdotukset.map(async (ehdotus) => {
      if (!ehdotus.rtKortti) return { ...ehdotus, rtKorttiTiedot: null };
      const kortti = await haeHakemistoKortti(db, ehdotus.rtKortti.split(",")[0].trim());
      if (!kortti) return { ...ehdotus, rtKortti: null, rtKorttiTiedot: null };
      const { tunnus, otsikko, tyyppi, julkaistu } = kortti;
      return { ...ehdotus, rtKorttiTiedot: { tunnus, otsikko, tyyppi, julkaistu } };
    }),
  );
}

/**
 * Hakee yhden sivullisen (oletus 20 hakutulossivua) koko RT-kortiston
 * tunnus+nimi-metatietoja kortistosta ja tallentaa ne rt_kortti_hakemisto-
 * tauluun. Sivutettu, koska koko kortisto on ~100+ hakutulossivua ja yksi
 * Worker-kutsu voi tehdä vain rajallisen määrän alipyyntöjä — kutsu
 * uudelleen palautetulla seuraavaSivu-arvolla kunnes se on null.
 */
async function kasitteleHakemistonPaivitys(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.headers.get("X-Jaettu-Salasana") !== env.JAETTU_SALASANA) {
    return jsonVastaus({ error: "Virheellinen salasana" }, 401, corsHeaders);
  }

  const alkusivu = Math.max(1, Number(url.searchParams.get("sivu") ?? "1") || 1);
  const maara = Math.min(25, Math.max(1, Number(url.searchParams.get("maara") ?? "20") || 20));

  try {
    const evasteet = await kirjaudu(env.RAKENNUSTIETO_USERNAME, env.RAKENNUSTIETO_PASSWORD);

    let kasitellytSivut = 0;
    let loytyneetKortit = 0;
    let sivujaYhteensa = alkusivu;

    for (let sivu = alkusivu; sivu < alkusivu + maara; sivu++) {
      const hakemistoSivu = await haeHakemistoSivu(evasteet, sivu);
      sivujaYhteensa = hakemistoSivu.sivujaYhteensa;
      await tallennaHakemistoRivit(env.DB, hakemistoSivu.kortit);
      loytyneetKortit += hakemistoSivu.kortit.length;
      kasitellytSivut++;
      if (sivu >= sivujaYhteensa) break;
    }

    const kasiteltySivuViimeeksi = alkusivu + kasitellytSivut - 1;
    const seuraavaSivu = kasiteltySivuViimeeksi < sivujaYhteensa ? kasiteltySivuViimeeksi + 1 : null;

    return jsonVastaus(
      {
        kasitellytSivut,
        loytyneetKortit,
        sivujaYhteensa,
        seuraavaSivu,
        hakemistonKokoYhteensa: await hakemistonKoko(env.DB),
      },
      200,
      corsHeaders,
    );
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "Hakemiston päivitys epäonnistui" }, 502, corsHeaders);
  }
}

/**
 * Hakee kortin PDF:n: ensin R2-välimuistista, muuten kirjautuu kortistoon ja
 * lataa sen suoraan hakemiston content_id:llä (ei hakusivun kutsua) ja
 * tallentaa R2:een, jotta samaa korttia ei ladata kortistosta toista kertaa.
 * null jos tunnusta ei ole hakemistossa tai lisenssi ei kata korttia.
 */
async function haeTaiLataaPdf(env: Env, tunnus: string): Promise<{ otsikko: string; pdfTavut: Uint8Array<ArrayBuffer> } | null> {
  const kortti = await haeHakemistoKortti(env.DB, tunnus);
  if (!kortti?.contentId) return null;

  const valimuistista = await haeRtPdf(env.KUVAT, kortti.contentId);
  if (valimuistista) return { otsikko: kortti.otsikko, pdfTavut: valimuistista };

  const evasteet = await kirjaudu(env.RAKENNUSTIETO_USERNAME, env.RAKENNUSTIETO_PASSWORD);
  const pdfTavut = await haeKortinPdf(evasteet, kortti.contentId);
  if (!pdfTavut) return null;
  await tallennaRtPdf(env.KUVAT, kortti.contentId, pdfTavut);
  return { otsikko: kortti.otsikko, pdfTavut };
}

/**
 * Hakee RT-kortin tiivistelmän tunnuksella — D1-välimuistista jos kortti on jo
 * kerran tiivistetty, muuten tiivistää kortin PDF:n (haeTaiLataaPdf)
 * Anthropic-API:lla ennen tallennusta. Jaettu sekä GET /rt-kortti -reitin
 * että /analysoi:n hae_rt_kortin_sisalto-työkalun käyttöön (ks. rtAnalyysi.ts).
 */
async function haeTaiTiivistaKortti(env: Env, tunnus: string): Promise<{ otsikko: string; tiivistelma: string } | null> {
  const valimuistista = await haeRtKortti(env.DB, tunnus);
  if (valimuistista) return valimuistista;

  const kortti = await haeTaiLataaPdf(env, tunnus);
  if (!kortti) return null;

  const tiivistelma = await tiivistaRtKortti(env.ANTHROPIC_API_KEY, tunnus, kortti.otsikko, kortti.pdfTavut);
  return tallennaRtKortti(env.DB, tunnus, kortti.otsikko, tiivistelma);
}

/**
 * Palauttaa RT-kortin alkuperäisen PDF:n ladattavaksi (GET /rt-kortti/pdf?tunnus=…).
 * Jaettu salasana kuten /rt-kortti:ssa. PDF välimuistitetaan R2:een
 * ensimmäisellä latauksella (ks. haeTaiLataaPdf).
 */
async function kasitteleRtKortinPdf(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.headers.get("X-Jaettu-Salasana") !== env.JAETTU_SALASANA) {
    return jsonVastaus({ error: "Virheellinen salasana" }, 401, corsHeaders);
  }

  const tunnus = url.searchParams.get("tunnus")?.split(",")[0].trim();
  if (!tunnus) {
    return jsonVastaus({ error: "tunnus-parametri on pakollinen" }, 400, corsHeaders);
  }

  try {
    const kortti = await haeTaiLataaPdf(env, tunnus);
    if (!kortti) {
      return jsonVastaus({ error: "Korttia ei löytynyt tai ei lisenssiä sen sisältöön" }, 404, corsHeaders);
    }
    return new Response(kortti.pdfTavut, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${tunnus.replace(/[^\w .-]/g, "_")}.pdf"`,
        "Cache-Control": "private, max-age=86400",
        ...corsHeaders,
      },
    });
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "RT-kortin PDF:n haku epäonnistui" }, 502, corsHeaders);
  }
}

/**
 * Hakee yhden RT-kortin tiivistelmän tunnuksen perusteella (esim. "RT 85-11253").
 * Jos kortti on jo kerran haettu ja tiivistetty, palautetaan D1-välimuistista
 * eikä kortistot.rakennustieto.fi:tä eikä Anthropic-API:a kutsuta uudelleen.
 */
async function kasitteleRtKortti(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.headers.get("X-Jaettu-Salasana") !== env.JAETTU_SALASANA) {
    return jsonVastaus({ error: "Virheellinen salasana" }, 401, corsHeaders);
  }

  // Ehdotuksen tunnukseen voi olla liitetty kohta ("RT 84-11093, kohta 3.2") —
  // välimuistiavaimena käytetään vain itse tunnusta, samoin kuin
  // varmistaRtKortit ja POST /reklamaatio tekevät, jotta napilla haettu
  // tiivistelmä löytyy myöhemmin myös reklamaation kirjoitukseen.
  const tunnus = url.searchParams.get("tunnus")?.split(",")[0].trim();
  if (!tunnus) {
    return jsonVastaus({ error: "tunnus-parametri on pakollinen" }, 400, corsHeaders);
  }

  try {
    const rivi = await haeTaiTiivistaKortti(env, tunnus);
    if (!rivi) {
      return jsonVastaus({ error: "Korttia ei löytynyt tai ei lisenssiä sen sisältöön" }, 404, corsHeaders);
    }
    return jsonVastaus(rivi, 200, corsHeaders);
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "RT-kortin haku epäonnistui" }, 502, corsHeaders);
  }
}

function jsonVastaus(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
