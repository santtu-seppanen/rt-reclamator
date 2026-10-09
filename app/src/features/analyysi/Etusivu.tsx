import { useState } from "react";
import type { FormEvent } from "react";
import { KuvaKentta } from "./KuvaKentta";
import { EhdotusLista } from "./EhdotusLista";
import { analysoiKuva, analysoiTaydellisesti } from "./analyysiApi";
import type { Analyysi } from "./types";
import { haeTekijanNimi, tallennaTekijanNimi } from "../../lib/tekijanNimi";
import { haeNykyinenSijaintiKerran } from "../../lib/geolocation";
import type { Sijainti } from "../../lib/geolocation";
import { pakkaaKuva } from "../../lib/kuvaPakkaus";

/** Viimeisin turvaraja lähetettävän kuvan koolle (ks. worker/src/validointi.ts). */
const KUVA_MAX_TAVUA = 3_000_000;

export function Etusivu() {
  const [tiedosto, setTiedosto] = useState<File | null>(null);
  const [muistiinpano, setMuistiinpano] = useState("");
  const [tekija, setTekija] = useState(() => haeTekijanNimi());
  const [sijainti, setSijainti] = useState<Sijainti | null>(null);
  const [sijaintiTila, setSijaintiTila] = useState<"idle" | "haetaan" | "virhe">("idle");
  const [lahetetaan, setLahetetaan] = useState<"nopea" | "taydellinen" | null>(null);
  const [virhe, setVirhe] = useState<string | null>(null);
  // Ensin aina nopea analyysi; täydellinen tehdään sen pohjalta napista ja
  // käyttäjä voi vaihtaa takaisin nopeaan tulokseen.
  const [nopeaTulos, setNopeaTulos] = useState<Analyysi | null>(null);
  const [taydellinenTulos, setTaydellinenTulos] = useState<Analyysi | null>(null);
  const [naytettava, setNaytettava] = useState<"nopea" | "taydellinen">("nopea");

  async function kasitteleSijaintiPyynto() {
    setSijaintiTila("haetaan");
    try {
      const uusiSijainti = await haeNykyinenSijaintiKerran();
      setSijainti(uusiSijainti);
      setSijaintiTila("idle");
    } catch {
      setSijaintiTila("virhe");
    }
  }

  function aloitaAlusta() {
    setTiedosto(null);
    setMuistiinpano("");
    setSijainti(null);
    setSijaintiTila("idle");
    setNopeaTulos(null);
    setTaydellinenTulos(null);
    setNaytettava("nopea");
    setVirhe(null);
  }

  async function lahetaNopea(e: FormEvent) {
    e.preventDefault();
    const siistiTekija = tekija.trim();
    if (!tiedosto || !siistiTekija) return;

    setLahetetaan("nopea");
    setVirhe(null);
    try {
      const pakattu = await pakkaaKuva(tiedosto, KUVA_MAX_TAVUA);
      const vastaus = await analysoiKuva({
        tekija: siistiTekija,
        muistiinpano: muistiinpano.trim() || null,
        lat: sijainti?.lat ?? null,
        lng: sijainti?.lng ?? null,
        kuva: pakattu,
        tila: "nopea",
      });
      tallennaTekijanNimi(siistiTekija);
      setNopeaTulos(vastaus);
      setNaytettava("nopea");
    } catch (virhe) {
      setVirhe(virhe instanceof Error ? virhe.message : "Analyysi epäonnistui");
    } finally {
      setLahetetaan(null);
    }
  }

  async function teeTaydellinen() {
    if (!nopeaTulos) return;
    if (taydellinenTulos) {
      setNaytettava("taydellinen");
      return;
    }

    setLahetetaan("taydellinen");
    setVirhe(null);
    try {
      const vastaus = await analysoiTaydellisesti(nopeaTulos.id, nopeaTulos.tekija);
      setTaydellinenTulos(vastaus);
      setNaytettava("taydellinen");
    } catch (virhe) {
      setVirhe(virhe instanceof Error ? virhe.message : "Täydellinen analyysi epäonnistui");
    } finally {
      setLahetetaan(null);
    }
  }

  if (nopeaTulos) {
    const tulos = naytettava === "taydellinen" && taydellinenTulos ? taydellinenTulos : nopeaTulos;
    const onTaydellinen = tulos === taydellinenTulos;

    return (
      <div className="tulos-kortti">
        <h2>{onTaydellinen ? "Täydellinen analyysi" : "Nopea analyysi"}</h2>
        <EhdotusLista
          key={tulos.id}
          kuvaId={tulos.id}
          havainto={tulos.havainto}
          ehdotukset={tulos.ehdotukset}
        />

        {virhe && (
          <p className="lomake-virhe" role="alert">
            {virhe}
          </p>
        )}

        <div className="analyysi-lahetys-napit">
          {onTaydellinen ? (
            <button type="button" className="nappi nappi-toissijainen" onClick={() => setNaytettava("nopea")}>
              Takaisin nopeaan analyysiin
            </button>
          ) : (
            <button
              type="button"
              className="nappi nappi-ensisijainen"
              onClick={teeTaydellinen}
              disabled={lahetetaan !== null}
              title="Tarkistaa ja täydentää nopean analyysin: lukee tarvittaessa myös RT-korttien sisällön. Voi kestää noin minuutin."
            >
              {lahetetaan === "taydellinen"
                ? "Analysoidaan tarkemmin… (voi kestää noin minuutin)"
                : taydellinenTulos
                  ? "Näytä täydellinen analyysi"
                  : "Täydellinen analyysi"}
            </button>
          )}
          <button
            type="button"
            className="nappi nappi-toissijainen"
            onClick={aloitaAlusta}
            disabled={lahetetaan !== null}
          >
            Analysoi uusi kuva
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="analyysi-lomake-kontti" onSubmit={lahetaNopea}>
      <h2>Kuvaa remonttikohde</h2>
      <p className="analyysi-ohje">
        Ota kuva remontti- tai rakennuskohteesta, niin sovellus etsii siitä mahdollisia
        rakennusvirheitä ja ehdottaa RT-kortin kohtia sekä lakipykäliä reklamaation tueksi.
      </p>

      <KuvaKentta onValitse={setTiedosto} vihjeTeksti="Kuva pakataan automaattisesti ennen lähetystä." />

      <label className="kentta">
        <span className="kentan-nimi">Lisätieto (valinnainen)</span>
        <textarea
          className="teksti-syote"
          rows={3}
          value={muistiinpano}
          onChange={(e) => setMuistiinpano(e.target.value)}
          placeholder="Esim. 'kylpyhuoneen lattian vedeneristys'"
        />
      </label>

      <label className="kentta">
        <span className="kentan-nimi">Nimesi</span>
        <input
          className="teksti-syote"
          value={tekija}
          onChange={(e) => setTekija(e.target.value)}
          placeholder="Esim. Matti M."
        />
      </label>

      <div className="kentta">
        <span className="kentan-nimi">Sijainti (valinnainen)</span>
        <button
          type="button"
          className="nappi nappi-toissijainen gps-nappi"
          onClick={kasitteleSijaintiPyynto}
          disabled={sijaintiTila === "haetaan"}
        >
          {sijainti
            ? "Sijainti tallennettu"
            : sijaintiTila === "haetaan"
              ? "Haetaan sijaintia…"
              : "Käytä nykyistä sijaintia"}
        </button>
        {sijaintiTila === "virhe" && (
          <span className="kentan-vihje">
            Sijaintia ei saatu. Voit silti lähettää kuvan ilman sijaintia.
          </span>
        )}
      </div>

      {virhe && (
        <p className="lomake-virhe" role="alert">
          {virhe}
        </p>
      )}

      <button
        className="nappi nappi-ensisijainen"
        type="submit"
        disabled={!tiedosto || !tekija.trim() || lahetetaan !== null}
      >
        {lahetetaan === "nopea" ? "Analysoidaan…" : "Analysoi"}
      </button>
    </form>
  );
}
