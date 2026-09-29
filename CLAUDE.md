# RT Reclamator

Sovellus, jolla kuvaa remontti- tai rakennuskohteen puhelimella ja saa
heti ehdotuksen mahdollisista rakennusvirheistä sekä niihin liittyvistä
Rakennustiedon RT-kortiston
(https://kortistot.rakennustieto.fi/kortistot/rt-kortisto) kohdista ja
Suomen lainsäädännön pykälistä, joihin reklamaatiossa voi vedota.
RT-kortisto sisältää satoja ohjekortteja rakentamisen eri osa-alueilta:
rakennusosat, talotekniikka, pintarakenteet, korjausrakentaminen,
työmaakäytännöt jne. — sovelluksen ydin on auttaa hahmottamaan nopeasti,
mihin kannattaa lähteä vetoamaan kuvassa näkyvän virheen perusteella.

- Etusivu (`app/src/features/analyysi/Etusivu.tsx`) on kuvan
  ottamista/lähetystä varten: kamerakuva tai galleriasta valittu kuva
  (`KuvaKentta.tsx`), vapaaehtoinen lisätieto tekstikenttänä, tekijän
  nimimerkki ja vapaaehtoinen sijainti (kertahaku, ei jatkuvaa seurantaa
  — ks. Konventiot). Lähetys menee Workerin `POST /analysoi`-reittiin,
  joka pyytää virhe-/reklamaatioehdotukset Anthropic-API:sta (Claude,
  kuvantulkinta) ja palauttaa ne heti — käyttäjä näkee tuloksen ilman
  erillistä hakua. Kesken analyysin malli voi itse kutsua kahta työkalua
  (`worker/src/rtAnalyysi.ts`: `hae_rt_kortteja_hakemistosta`,
  `hae_rt_kortin_sisalto`) tarkistaakseen oikean RT-kortin ennen
  ehdotuksen kirjaamista — sekä nopea tunnus+nimi-hakemistohaku (D1) että
  tarvittaessa koko kortin sisällön haku kortistosta ovat siis sallittuja
  osana itse analyysiä, jos ne parantavat ehdotuksen laatua. Enintään 4
  keskustelukierrosta per analyysi, viimeinen pakottaa lopullisen
  vastauksen — pitää kokonaiskeston hallittuna vaikka malli käyttäisi
  työkaluja. Käyttäjä valitsee itse painotuksen kahdella napilla
  ("Nopea analyysi" / "Täydellinen analyysi", `Etusivu.tsx`), jotka
  lähettävät `POST /analysoi`:lle kentän `tila: "nopea" | "taydellinen"`
  (`rtAnalyysi.ts`:n `AnalyysiTila`; puuttuessaan oletus on
  "taydellinen"). "nopea" jättää hitaan sisällönhakutyökalun kokonaan
  pois tarjolta (vastaus tyypillisesti muutamassa sekunnissa), koska
  Anthropic ei voi kutsua työkalua jota ei ole `tools`-listassa —
  "taydellinen" tarjoaa molemmat ja voi siksi joskus kestää
  kymmeniä sekunteja. Molemmissa RT-korttitunnus on silti aina joko
  oikea tai tyhjä (ks. alla).
- **Ehdotukset (`POST /analysoi`) ovat tekoälyn arvioita kuvasta, eivät
  lakineuvontaa.** Mallilla ei ole lakimieskoulutusta — se antaa tarkan
  lakipykälän vain jos se on siitä kohtuullisen varma, muuten pelkän
  lakialueen sanallisesti ja rehellisen matalan varmuuden (ks.
  `worker/src/rtAnalyysi.ts`:n `SYSTEEMIKEHOTE`). Frontend näyttää tämän
  aina käyttäjälle (`EhdotusLista.tsx`:n vastuuvapauslauseke + kehotus
  varmistaa lakipykälät asiantuntijalta) — älä koskaan esitä ehdotuksia
  sitovana lakineuvontana. **RT-korttitunnus sen sijaan on aina joko
  todellinen tai tyhjä, ei koskaan hallusinoitu:** mallia ohjeistetaan
  käyttämään hakutyökaluja ennen tunnuksen ehdottamista (ks. yllä), ja
  tämän lisäksi `/analysoi` tarkistaa lopullisenkin ehdotetun tunnuksen
  vielä `rt_kortti_hakemisto`-taulua vasten (`varmistaRtKortit`
  `index.ts`:ssä) ja tyhjentää sen jos vastaavaa korttia ei oikeasti ole
  olemassa — kaksi kerrosta, joista jälkimmäinen on kova tekninen tae eikä
  vain kehotteeseen luottamista (toimii vaikka malli unohtaisi käyttää
  työkaluja). Lakipykälille
  vastaavaa tarkistusta ei ole (ei ole olemassa vastaavaa konetestattavaa
  lakikortistoa), joten niiden osalta luotetaan yhä pelkkään mallin omaan
  matalan varmuuden ilmoittamiseen. `GET /rt-kortti` hakee ja tiivistää
  oikean, jo-vahvistetun kortin koko sisällön käyttäjän pyynnöstä.
- Historianäkymä (header → "Historia", `Historia.tsx`) listaa kaikki
  aiemmin lähetetyt kuvat (`GET /analyysit`), suodatettavissa "vain omat
  kuvani" -valinnalla samalla laitekohtaisella nimimerkkimuistilla kuin
  lähetyslomake. Rivin avaaminen näyttää sen virhe-/reklamaatioehdotukset
  uudelleen.
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
    (JSON-taulukko RT-ehdotuksia) ja aika. Lisäksi taulu `rt_kortit`:
    tunnus (esim. "RT 85-11253", PK), otsikko, tiivistelma, haettu_aika —
    välimuisti `GET /rt-kortti`-reitille (ks. alla), ettei samaa korttia
    tarvitse hakea/kirjautua/tiivistää uudelleen.
  - **Cloudflare R2** — itse kuvatiedostot. Worker tarjoilee ne
    `GET /kuvat/:tiedostonimi`-reitin kautta, joten frontend rakentaa
    kuvan URL:n `${VITE_API_URL}/kuvat/<tiedosto>`.
  - **Anthropic API** (Claude, kuvantulkinta ja RT-korttien tiivistys) —
    `worker/src/rtAnalyysi.ts` ja `worker/src/rtKortisto.ts` kutsuvat sitä
    suoraan `fetch`:illä (ei SDK-riippuvuutta) pakotetulla
    työkalukutsulla (`tool_choice`), jotta vastaus on aina jäsennelty
    JSON eikä vapaamuotoista tekstiä.
  - **kortistot.rakennustieto.fi** — `worker/src/rtKortisto.ts` kirjautuu
    sisään Workerin salaisuuksiin tallennetulla henkilökohtaisella/
    yrityslisenssillä (`RAKENNUSTIETO_USERNAME`/`RAKENNUSTIETO_PASSWORD`,
    sama SSO-kirjautuminen jota selainkin käyttää: NextAuth → AWS Cognito →
    Rakennustieto-UAA) ja hakee **vain yksittäisen, jo tunnetun kortin**
    tunnuksen perusteella (ei kortiston massalatausta). **Huom:** kaikki
    sovelluksen käyttäjät käyttävät tässä samaa yhtä lisenssiä palvelimen
    kautta — tämä on tietoinen päätös, varmista että se on sallittua
    lisenssiehtojenne mukaan jos käyttäjäkunta kasvaa. Kirjautumisen HTML-
    rakenteeseen sidotut yksityiskohdat (lomakkeen `_csrf`, kolme eri
    lomaketta samalla sivulla) voivat rikkoutua jos rakennustieto.fi
    muuttaa kirjautumissivuaan.
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
  - `GET /rt-kortti?tunnus=<esim. "RT 85-11253">` — tarkistaa jaetun
    salasanan (sama header/syy kuin `/analysoi`), katsoo löytyykö tunnus jo
    `rt_kortit`-taulusta (jos löytyy, palauttaa sen heti eikä kutsu mitään
    ulkoista palvelua). Jos ei löydy: kirjautuu kortistot.rakennustieto.fi:hin
    (`rtKortisto.ts`:n `kirjaudu`), hakee kortin PDF-sisällön
    (`haeKortinSisalto`), pyytää siitä suomenkielisen tiivistelmän
    Anthropic-API:lta (`tiivistaRtKortti`) ja tallentaa tuloksen
    `rt_kortit`-tauluun ennen palautusta. 404 jos tunnusta ei löydy tai
    lisenssi ei kata sitä.
  - `POST /rt-kortti-hakemisto/paivita?sivu=1&maara=20` — rakentaa/päivittää
    `rt_kortti_hakemisto`-taulun (tunnus, otsikko, tyyppi, julkaistu,
    content_id): kirjautuu ja hakee `maara` sivua laajalla `"*"`-haulla
    (`rtKortisto.ts`:n `haeHakemistoSivu`), suodattaa RT-alkuiset tulokset ja
    tallentaa ne. Koko kortisto on n. 70-115 hakutulossivua eikä yksi
    Worker-kutsu voi tehdä rajattomasti alipyyntöjä, joten reitti on
    sivutettu — kutsu uudelleen vastauksen `seuraavaSivu`-arvolla kunnes se
    on `null`. **Tämän hakemiston tarkoitus:** `POST /analysoi` tarkistaa
    jokaisen ehdotuksen `rtKortti`-tunnuksen tätä taulua vasten
    (`varmistaRtKortit` `index.ts`:ssä) ja tyhjentää sen jos tunnusta ei
    löydy — malli ei siis voi enää näyttää hallusinoitua RT-korttinumeroa
    todellisena käyttäjälle, vaikka se itse "uskoisi" siihen. Aja tämä
    hakemistopäivitys aina käyttöönoton yhteydessä (tyhjä hakemisto = kaikki
    ehdotusten korttitunnukset tyhjenevät) ja satunnaisesti myöhemmin
    kortiston sisällön muuttuessa — ei toistaiseksi ajastettu automaattisesti.
  - **Käyttöönotto (tekee käyttäjä itse, ei automatisoitu):**
    `cd worker && ./deploy.sh` (tai `npm run setup`) — yksi skripti joka
    hoitaa kirjautumisen, D1-tietokannan ja R2-kuvavaraston luonnin (jos
    eivät jo olemassa), `database_id`:n kirjoittamisen `wrangler.toml`:iin,
    migraatioiden ajon, salaisuuksien kysymisen (`JAETTU_SALASANA`,
    `ANTHROPIC_API_KEY`, `RAKENNUSTIETO_USERNAME`, `RAKENNUSTIETO_PASSWORD`
    — jos eivät jo asetettu) ja lopuksi deployn.
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

`POST /analysoi` ja `GET /rt-kortti` vaativat lisäksi paikalliset
salaisuudet — luo `worker/.dev.vars` (gitignorattu):

```
JAETTU_SALASANA=<mikä tahansa arvo, sama kuin app/.env.local:in VITE_JAETTU_SALASANA>
ANTHROPIC_API_KEY=<oikea Anthropic API -avain — analyysi tekee oikean, maksullisen API-kutsun myös paikallisesti>
RAKENNUSTIETO_USERNAME=<oikea kortistot.rakennustieto.fi-tunnus — vaaditaan vain /rt-kortti:lle>
RAKENNUSTIETO_PASSWORD=<sen salasana>
```

```bash
# frontend, toisessa terminaalissa — .env.local:in VITE_API_URL
# pitää osoittaa paikalliseen workeriin (esim. http://localhost:8787)
cd app && npm install && npm run dev
```
