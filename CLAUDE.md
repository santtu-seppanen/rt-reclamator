# RT Reclamator

Sovellus, jolla kuvaa remontti- tai rakennuskohteen puhelimella ja saa
heti ehdotuksen siihen sopivista Rakennustiedon RT-kortiston
(https://kortistot.rakennustieto.fi/kortistot/rt-kortisto) korteista.
RT-kortisto sisältää satoja ohjekortteja rakentamisen eri osa-alueilta:
rakennusosat, talotekniikka, pintarakenteet, korjausrakentaminen,
työmaakäytännöt jne. — sovelluksen ydin on auttaa hahmottamaan nopeasti,
minkä aihepiirin kortteja kannattaa lähteä etsimään kuvassa näkyvän työn
perusteella.

- Etusivu (`app/src/features/analyysi/Etusivu.tsx`) on kuvan
  ottamista/lähetystä varten: kamerakuva tai galleriasta valittu kuva
  (`KuvaKentta.tsx`), vapaaehtoinen lisätieto tekstikenttänä, tekijän
  nimimerkki ja vapaaehtoinen sijainti (kertahaku, ei jatkuvaa seurantaa
  — ks. Konventiot). Lähetys menee Workerin `POST /analysoi`-reittiin,
  joka pyytää RT-korttiehdotukset Anthropic-API:sta (Claude, kuvantulkinta)
  ja palauttaa ne heti — käyttäjä näkee tuloksen ilman erillistä hakua.
- **Ehdotukset ovat tekoälyn arvioita, ei kortiston suora haku.** Worker ei
  hae RT-kortistoa reaaliaikaisesti — malli antaa tarkan korttitunnuksen
  vain jos se on siitä kohtuullisen varma, muuten pelkän aihepiirin
  sanallisesti ja rehellisen matalan varmuuden (ks.
  `worker/src/rtAnalyysi.ts`:n `SYSTEEMIKEHOTE`). Frontend näyttää tämän
  aina käyttäjälle (`EhdotusLista.tsx`:n vastuuvapauslauseke + linkki
  itse kortistoon) — älä koskaan esitä ehdotuksia varmoina fakta-korttien
  numeroina.
- Historianäkymä (header → "Historia", `Historia.tsx`) listaa kaikki
  aiemmin lähetetyt kuvat (`GET /analyysit`), suodatettavissa "vain omat
  kuvani" -valinnalla samalla laitekohtaisella nimimerkkimuistilla kuin
  lähetyslomake. Rivin avaaminen näyttää sen RT-ehdotukset uudelleen.
- Sijainti (lat/lng) tallennetaan kuvan mukana **pelkkänä metatietona**
  (esim. mahdollista tulevaa "näytä kartalla" -näkymää varten) — sillä ei
  ole mitään vaikutusta siihen, näytetäänkö tai avautuuko jokin sisältö.
  Ei etäisyyslaskentaa, ei geofencingiä, ei aluejakoa.

## Arkkitehtuuri lyhyesti

- `app/` on Vite + React + TypeScript -PWA, joka toimii selaimessa ja on
  asennettavissa PWA:na. Yksi vaihe — ei suunniteltua natiivi-/Capacitor-
  jatkoa, koska mikään ominaisuus ei vaadi taustapaikannusta tai muuta
  natiivirajapintaa (sijainti haetaan `navigator.geolocation`-kertahaulla,
  vain kuvan metatiedoksi, ks. `app/src/lib/geolocation.ts`).
- **Data asuu Cloudflaressa, ei gitissä.** `worker/` on ainoa "backend"-osa
  ja ainoa taho joka lukee/kirjoittaa dataa tai kutsuu Anthropic-API:a.
  - **Cloudflare D1** (SQLite) — taulu `kuvat` (ks. `worker/migrations/`):
    id, tekija, tiedostonimi (R2-avain), muistiinpano, lat/lng
    (molemmat nullable), havainto (mallin kuvaus kuvasta), ehdotukset
    (JSON-taulukko RT-ehdotuksia) ja aika.
  - **Cloudflare R2** — itse kuvatiedostot. Worker tarjoilee ne
    `GET /kuvat/:tiedostonimi`-reitin kautta, joten frontend rakentaa
    kuvan URL:n `${VITE_API_URL}/kuvat/<tiedosto>`.
  - **Anthropic API** (Claude, kuvantulkinta) — `worker/src/rtAnalyysi.ts`
    kutsuu sitä suoraan `fetch`:illä (ei SDK-riippuvuutta) pakotetulla
    työkalukutsulla (`tool_choice`), jotta vastaus on aina jäsennelty
    JSON eikä vapaamuotoista tekstiä.
- **`worker/` — Cloudflare Worker, koko sovelluksen backend.** Reitit:
  - `GET /analyysit` — palauttaa kaikki kuva-analyysit D1:stä uusimmasta
    vanhimpaan. Julkinen, ei vaadi salasanaa — kuvahistoria ei ole
    arkaluontoista dataa.
  - `GET /kuvat/:tiedostonimi` — striimaa kuvan R2:sta oikealla
    `Content-Type`-headerilla.
  - `POST /analysoi` — validoi pyynnön (`worker/src/validointi.ts`:
    tekijä, valinnainen muistiinpano, valinnainen lat+lng-pari, kuva),
    tarkistaa jaetun salasanan (`X-Jaettu-Salasana`-header — karsii
    botteja/väärinkäyttöä maksullisesta Anthropic-kutsusta, ei oikea
    autentikointi), kutsuu `analysoiRemontti`:a, tallentaa kuvan R2:een
    ja rivin `kuvat`-tauluun, ja palauttaa koko tallennetun rivin
    (ehdotukset mukana) suoraan vastauksessa.
  - **Käyttöönotto (tekee käyttäjä itse, ei automatisoitu):**
    `cd worker && ./deploy.sh` (tai `npm run setup`) — yksi skripti joka
    hoitaa kirjautumisen, D1-tietokannan ja R2-kuvavaraston luonnin (jos
    eivät jo olemassa), `database_id`:n kirjoittamisen `wrangler.toml`:iin,
    migraatioiden ajon, salaisuuksien kysymisen (`JAETTU_SALASANA`,
    `ANTHROPIC_API_KEY`, jos eivät jo asetettu) ja lopuksi deployn.
    Turvallinen ajaa uudelleen. Tulostaa lopuksi Workerin URL:n, joka
    pitää asettaa `VITE_API_URL`-build-time-env-muuttujaksi (ks.
    `app/.env.local.example`) sekä paikalliseen kehitykseen että GitHub
    Actions -buildiin — sama URL palvelee kaikkia reittejä. Pelkkä uusi
    deploy ilman provisiointia: `npm run deploy`.

## Konventiot

- TypeScript strict-tilassa sekä `app/`:ssa että `worker/`:ssa.
- Frontend jäsennelty feature-kansioihin (`src/features/<ominaisuus>/`), ei
  tyyppikohtaisiin kansioihin (`components/`, `hooks/` jne. sekoitettuna).
  - `features/analyysi/` — kuvan lähetys, RT-ehdotusten esitys ja
    kuvahistoria. Ainoa feature-kansio toistaiseksi.
- Jaettu, ominaisuuksista riippumaton koodi menee `src/lib/`:iin:
  - `lib/kuvaPakkaus.ts` — skaalaa/pakkaa kamerakuvan JPEG:ksi ennen
    lähetystä (puhelimen kamerakuva voi olla useita megatavuja).
  - `lib/geolocation.ts` — **vain kertahaku** (`getCurrentPosition`),
    ei `watchPosition`-seurantaa. Sijainti on kuvan metatietoa, ei
    minkään ominaisuuden edellytys — älä lisää jatkuvaa
    sijaintiseurantaa tai etäisyyspäättelyä ilman että sille on oikeasti
    käyttötarve.
  - `lib/tekijanNimi.ts` — muistaa tekijän nimimerkin laitteella
    `localStorage`:ssa; sovelluksella ei ole käyttäjätilejä/
    rekisteröitymistä eikä sellaista ole tarkoitus lisätä tätä varten.
  - `lib/Modaali.tsx` — täyden ruudun modaali natiivilla `<dialog>`:lla.
- Älä lisää abstraktioita tai konfiguraatiota, joita ei tarvita nyt (esim.
  karttanäkymää, aluejakoa tai geofencingiä ei ole — jos sijaintitieto
  halutaan joskus näyttää kartalla, se on oma, erikseen päätettävä
  ominaisuus).

## Subagentit (`.claude/agents/`)

Työ on jaettu vastuualueittain, jotta kukin subagentti pysyy fokusoituna:

| Agentti | Vastuu |
|---|---|
| `mobile-agent` | UI: kuvan otto/lähetys, ehdotusten esitys, historianäkymä (`app/`) |
| `qa-agent` | Testit (yksikkö- ja integraatiotestit) |

`worker/`-Cloudflare Workerille ei ole omaa subagenttia — se on pieni ja
riittävän harvoin muuttuva, että sitä muokataan suoraan.

Mallivalinnat subagenteille on kunkin agentin omassa frontmatterissa
(`model:`-kenttä) — halvempia malleja käytetään yksinkertaisiin, hyvin
rajattuihin tehtäviin (esim. testien kirjoitus), tehokkaampia UI-työhön.

## Ajaminen paikallisesti

Sovellus hakee kuvahistorian ajonaikaisesti Workerista, joten Workerin
täytyy olla käynnissä myös silloin kun vain selaa historiaa:

```bash
# worker (paikallinen D1/R2, ei vaadi Cloudflare-tiliä GET-reiteille)
cd worker && npm install
npx wrangler d1 migrations apply rt-reclamator-db --local
npm run dev
```

`POST /analysoi` vaatii lisäksi paikalliset salaisuudet — luo
`worker/.dev.vars` (gitignorattu):

```
JAETTU_SALASANA=<mikä tahansa arvo, sama kuin app/.env.local:in VITE_JAETTU_SALASANA>
ANTHROPIC_API_KEY=<oikea Anthropic API -avain — analyysi tekee oikean, maksullisen API-kutsun myös paikallisesti>
```

```bash
# frontend, toisessa terminaalissa — .env.local:in VITE_API_URL
# pitää osoittaa paikalliseen workeriin (esim. http://localhost:8787)
cd app && npm install && npm run dev
```
