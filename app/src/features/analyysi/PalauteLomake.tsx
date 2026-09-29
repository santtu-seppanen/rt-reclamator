import { useState } from "react";
import type { PalauteArvio } from "./types";
import { lahetaPalaute } from "./analyysiApi";
import { haeTekijanNimi } from "../../lib/tekijanNimi";

const KOMMENTTI_MAX_PITUUS = 1000;

interface PalauteLomakeProps {
  reklamaatioId: string;
  /** Minkä ehdotuksen palaute koskee; null = koko reklamaatioluonnos. */
  ehdotusIndeksi: number | null;
  kysymys: string;
  kommenttiVihje: string;
  /** Käyttäjän muokkaama reklamaatioteksti, lähetetään palautteen mukana jos annettu. */
  muokattuTeksti?: string | null;
}

type Lahetystila = "idle" | "lahetetaan" | "lahetetty";

/**
 * Peukku ylös/alas + vapaaehtoinen kommentti. Näytetään vasta kun
 * reklamaatioluonnos on kirjoitettu (ks. Reklamaatio.tsx). Palaute
 * tallennetaan Workeriin (POST /palaute) tekoälyn ohjeistuksen
 * parantamista varten.
 * Arvion valinta vasta avaa kommenttikentän, jotta palaute lähtee yhdellä
 * pyynnöllä arvion ja kommentin kanssa.
 */
export function PalauteLomake({
  reklamaatioId,
  ehdotusIndeksi,
  kysymys,
  kommenttiVihje,
  muokattuTeksti = null,
}: PalauteLomakeProps) {
  const [arvio, setArvio] = useState<PalauteArvio | null>(null);
  const [kommentti, setKommentti] = useState("");
  const [tila, setTila] = useState<Lahetystila>("idle");
  const [virhe, setVirhe] = useState<string | null>(null);

  if (tila === "lahetetty") {
    return <p className="palaute-kiitos">Kiitos palautteesta!</p>;
  }

  async function laheta() {
    if (!arvio) return;
    setTila("lahetetaan");
    setVirhe(null);
    try {
      await lahetaPalaute({
        reklamaatioId,
        ehdotusIndeksi,
        arvio,
        kommentti: kommentti.trim() || null,
        muokattuTeksti,
        tekija: haeTekijanNimi().trim() || null,
      });
      setTila("lahetetty");
    } catch (e) {
      setVirhe(e instanceof Error ? e.message : "Palautteen lähetys epäonnistui");
      setTila("idle");
    }
  }

  return (
    <div className="palaute">
      <div className="palaute-rivi">
        <span className="palaute-kysymys">{kysymys}</span>
        <button
          type="button"
          className={`palaute-nappi${arvio === "hyva" ? " palaute-nappi-valittu" : ""}`}
          aria-pressed={arvio === "hyva"}
          aria-label="Osuva"
          title="Osuva"
          onClick={() => setArvio("hyva")}
        >
          👍
        </button>
        <button
          type="button"
          className={`palaute-nappi${arvio === "huono" ? " palaute-nappi-valittu" : ""}`}
          aria-pressed={arvio === "huono"}
          aria-label="Ei osuva"
          title="Ei osuva"
          onClick={() => setArvio("huono")}
        >
          👎
        </button>
      </div>

      {arvio && (
        <>
          <textarea
            className="teksti-syote palaute-kommentti"
            rows={2}
            maxLength={KOMMENTTI_MAX_PITUUS}
            placeholder={kommenttiVihje}
            value={kommentti}
            onChange={(e) => setKommentti(e.target.value)}
          />
          <button
            type="button"
            className="nappi nappi-toissijainen palaute-laheta"
            disabled={tila === "lahetetaan"}
            onClick={laheta}
          >
            {tila === "lahetetaan" ? "Lähetetään…" : "Lähetä palaute"}
          </button>
        </>
      )}

      {virhe && <p className="lomake-virhe">{virhe}</p>}
    </div>
  );
}
