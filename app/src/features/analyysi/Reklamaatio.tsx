import { useState } from "react";
import type { Reklamaatio as ReklamaatioTyyppi, RtEhdotus } from "./types";
import { kirjoitaReklamaatio } from "./analyysiApi";
import { PalauteLomake } from "./PalauteLomake";
import { haeTekijanNimi } from "../../lib/tekijanNimi";

const LISATIETO_MAX_PITUUS = 1000;

interface ReklamaatioProps {
  kuvaId: string;
  ehdotukset: RtEhdotus[];
}

type Vaihe = "kiinni" | "valinta" | "luonnos";

/**
 * Reklamaatioluonnoksen kirjoitus analyysin ehdotuksista: käyttäjä valitsee
 * mitkä virheet otetaan mukaan ja antaa halutessaan lisätietoja, Worker
 * kirjoittaa luonnoksen (POST /reklamaatio). Palautetta kysytään vasta
 * luonnoksen jälkeen — vasta silloin käyttäjä tietää, mitkä ehdotukset
 * oikeasti kelpasivat reklamaatioon.
 */
export function Reklamaatio({ kuvaId, ehdotukset }: ReklamaatioProps) {
  const [vaihe, setVaihe] = useState<Vaihe>("kiinni");
  const [valitut, setValitut] = useState<Set<number>>(() => new Set(ehdotukset.map((_, i) => i)));
  const [lisatieto, setLisatieto] = useState("");
  const [kirjoitetaan, setKirjoitetaan] = useState(false);
  const [virhe, setVirhe] = useState<string | null>(null);
  const [reklamaatio, setReklamaatio] = useState<ReklamaatioTyyppi | null>(null);
  const [teksti, setTeksti] = useState("");
  const [kopioitu, setKopioitu] = useState(false);

  function vaihdaValinta(indeksi: number) {
    setValitut((edelliset) => {
      const uudet = new Set(edelliset);
      if (uudet.has(indeksi)) uudet.delete(indeksi);
      else uudet.add(indeksi);
      return uudet;
    });
  }

  async function luoLuonnos() {
    setKirjoitetaan(true);
    setVirhe(null);
    try {
      const vastaus = await kirjoitaReklamaatio({
        kuvaId,
        ehdotusIndeksit: [...valitut].sort((a, b) => a - b),
        lisatieto: lisatieto.trim() || null,
        tekija: haeTekijanNimi().trim() || null,
      });
      setReklamaatio(vastaus);
      setTeksti(vastaus.teksti);
      setVaihe("luonnos");
    } catch (e) {
      setVirhe(e instanceof Error ? e.message : "Reklamaation kirjoitus epäonnistui");
    } finally {
      setKirjoitetaan(false);
    }
  }

  async function kopioi() {
    try {
      await navigator.clipboard.writeText(teksti);
      setKopioitu(true);
    } catch {
      setVirhe("Kopiointi epäonnistui — valitse teksti ja kopioi se käsin.");
    }
  }

  if (vaihe === "kiinni") {
    return (
      <button type="button" className="nappi nappi-ensisijainen" onClick={() => setVaihe("valinta")}>
        Kirjoita reklamaatio
      </button>
    );
  }

  if (vaihe === "valinta" || !reklamaatio) {
    return (
      <div className="reklamaatio">
        <h3>Kirjoita reklamaatio</h3>
        <fieldset className="reklamaatio-valinnat">
          <legend className="kentan-nimi">Mitkä virheet otetaan mukaan?</legend>
          {ehdotukset.map((ehdotus, indeksi) => (
            <label key={indeksi} className="reklamaatio-valinta">
              <input type="checkbox" checked={valitut.has(indeksi)} onChange={() => vaihdaValinta(indeksi)} />
              {ehdotus.aihe}
            </label>
          ))}
        </fieldset>

        <label className="kentta">
          <span className="kentan-nimi">Lisätiedot reklamaatioon (valinnainen)</span>
          <textarea
            className="teksti-syote"
            rows={3}
            maxLength={LISATIETO_MAX_PITUUS}
            placeholder="Esim. urakoitsijan nimi, kohteen osoite, sopimuksen päiväys, milloin virhe havaittiin"
            value={lisatieto}
            onChange={(e) => setLisatieto(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="nappi nappi-ensisijainen"
          disabled={valitut.size === 0 || kirjoitetaan}
          onClick={luoLuonnos}
        >
          {kirjoitetaan ? "Kirjoitetaan luonnosta…" : "Luo reklamaatioluonnos"}
        </button>
        <button
          type="button"
          className="nappi nappi-toissijainen"
          disabled={kirjoitetaan}
          onClick={() => setVaihe("kiinni")}
        >
          Peruuta
        </button>
        {virhe && <p className="lomake-virhe">{virhe}</p>}
      </div>
    );
  }

  const muokattuTeksti = teksti.trim() !== reklamaatio.teksti.trim() ? teksti : null;

  return (
    <div className="reklamaatio">
      <h3>Reklamaatioluonnos</h3>
      <textarea
        className="teksti-syote reklamaatio-teksti"
        rows={16}
        value={teksti}
        onChange={(e) => {
          setTeksti(e.target.value);
          setKopioitu(false);
        }}
      />
      <button type="button" className="nappi nappi-toissijainen" onClick={kopioi}>
        {kopioitu ? "Kopioitu ✓" : "Kopioi leikepöydälle"}
      </button>
      {virhe && <p className="lomake-virhe">{virhe}</p>}
      <p className="ehdotus-vastuuvapaus">
        Tekoälyn kirjoittama luonnos, ei lakineuvontaa. Täydennä hakasulkeissa olevat kohdat ja
        tarkista viittaukset ennen lähettämistä.
      </p>

      <div className="reklamaatio-palaute">
        <h3>Palaute</h3>
        <p className="ehdotus-vastuuvapaus">
          Palautteesi auttaa parantamaan tekoälyn ohjeistusta. Jos muokkasit luonnosta, muokattu
          teksti lähetetään koko luonnosta koskevan palautteen mukana.
        </p>
        <PalauteLomake
          reklamaatioId={reklamaatio.id}
          ehdotusIndeksi={null}
          kysymys="Oliko reklamaatioluonnos käyttökelpoinen?"
          kommenttiVihje="Mitä jouduit korjaamaan, tai jäikö jokin virhe kokonaan huomaamatta? (valinnainen)"
          muokattuTeksti={muokattuTeksti}
        />
        {reklamaatio.ehdotusIndeksit.map((indeksi) => (
          <div key={indeksi} className="reklamaatio-palaute-ehdotus">
            <span className="ehdotus-aihe">{ehdotukset[indeksi]?.aihe}</span>
            <PalauteLomake
              reklamaatioId={reklamaatio.id}
              ehdotusIndeksi={indeksi}
              kysymys="Oliko ehdotus osuva?"
              kommenttiVihje="Mikä meni pieleen (esim. väärä RT-kortti tai lakipykälä)? (valinnainen)"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
