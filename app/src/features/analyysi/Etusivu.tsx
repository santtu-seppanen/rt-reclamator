import { useState } from "react";
import type { FormEvent } from "react";
import { KuvaKentta } from "./KuvaKentta";
import { EhdotusLista } from "./EhdotusLista";
import { analysoiKuva } from "./analyysiApi";
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
  const [lahetetaan, setLahetetaan] = useState(false);
  const [virhe, setVirhe] = useState<string | null>(null);
  const [tulos, setTulos] = useState<Analyysi | null>(null);

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
    setTulos(null);
    setVirhe(null);
  }

  async function lahetaKuva(e: FormEvent) {
    e.preventDefault();
    const siistiTekija = tekija.trim();
    if (!tiedosto || !siistiTekija) return;

    setLahetetaan(true);
    setVirhe(null);
    try {
      const pakattu = await pakkaaKuva(tiedosto, KUVA_MAX_TAVUA);
      const vastaus = await analysoiKuva({
        tekija: siistiTekija,
        muistiinpano: muistiinpano.trim() || null,
        lat: sijainti?.lat ?? null,
        lng: sijainti?.lng ?? null,
        kuva: pakattu,
      });
      tallennaTekijanNimi(siistiTekija);
      setTulos(vastaus);
    } catch (virhe) {
      setVirhe(virhe instanceof Error ? virhe.message : "Analyysi epäonnistui");
    } finally {
      setLahetetaan(false);
    }
  }

  if (tulos) {
    return (
      <div className="tulos-kortti">
        <h2>Havaitut rakennusvirheet</h2>
        <EhdotusLista havainto={tulos.havainto} ehdotukset={tulos.ehdotukset} />
        <button type="button" className="nappi nappi-ensisijainen" onClick={aloitaAlusta}>
          Analysoi uusi kuva
        </button>
      </div>
    );
  }

  return (
    <form className="analyysi-lomake-kontti" onSubmit={lahetaKuva}>
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
        disabled={!tiedosto || !tekija.trim() || lahetetaan}
      >
        {lahetetaan ? "Analysoidaan…" : "Analysoi kuva"}
      </button>
    </form>
  );
}
