import { haeKuvat, lisaaKuva } from "./d1.js";
import { haeKuva, tallennaKuva } from "./r2.js";
import { validoiAnalysoiPyynto } from "./validointi.js";
import { analysoiRemontti } from "./rtAnalyysi.js";

interface Env {
  DB: D1Database;
  KUVAT: R2Bucket;
  JAETTU_SALASANA: string;
  ANTHROPIC_API_KEY: string;
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

    return jsonVastaus({ error: "Reittiä ei löydy" }, 404, corsHeaders);
  },
};

async function kasitteleKuva(
  tiedostonimi: string,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
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

  let analyysi;
  try {
    analyysi = await analysoiRemontti(env.ANTHROPIC_API_KEY, pyynto.kuva, pyynto.muistiinpano);
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "RT-analyysi epäonnistui. Yritä uudelleen." }, 502, corsHeaders);
  }

  const id = crypto.randomUUID();
  const tiedostonimi = `${id}.${pyynto.kuva.tiedostopaate}`;

  try {
    await tallennaKuva(env.KUVAT, tiedostonimi, pyynto.kuva.data);
    const kuva = await lisaaKuva(env.DB, {
      id,
      tekija: pyynto.tekija,
      tiedostonimi,
      muistiinpano: pyynto.muistiinpano,
      lat: pyynto.lat,
      lng: pyynto.lng,
      havainto: analyysi.havainto,
      ehdotukset: analyysi.ehdotukset,
    });
    return jsonVastaus(kuva, 201, corsHeaders);
  } catch (virhe) {
    console.error(virhe);
    return jsonVastaus({ error: "Tallennus epäonnistui" }, 502, corsHeaders);
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
