import { useEffect, useState } from "react";
import { haeAnalyysit } from "./analyysiApi";
import type { Analyysi } from "./types";
import { EhdotusLista } from "./EhdotusLista";
import { haeTekijanNimi } from "../../lib/tekijanNimi";

interface HistoriaProps {
  onSulje: () => void;
}

type Lataustila = "lataa" | "valmis" | "virhe";

/** Aiemmin lähetettyjen kuvien historia — jokainen rivi avautuu näyttämään sen rakennusvirhe-/reklamaatioehdotukset. */
export function Historia({ onSulje }: HistoriaProps) {
  const [analyysit, setAnalyysit] = useState<Analyysi[]>([]);
  const [lataustila, setLataustila] = useState<Lataustila>("lataa");
  const [vainOmat, setVainOmat] = useState(false);
  const [avoinId, setAvoinId] = useState<string | null>(null);
  const omaNimi = haeTekijanNimi().trim().toLowerCase();

  useEffect(() => {
    let peruttu = false;

    async function lataa() {
      setLataustila("lataa");
      try {
        const data = await haeAnalyysit();
        if (peruttu) return;
        setAnalyysit(data);
        setLataustila("valmis");
      } catch {
        if (peruttu) return;
        setLataustila("virhe");
      }
    }

    lataa();
    return () => {
      peruttu = true;
    };
  }, []);

  const naytettavat = vainOmat
    ? analyysit.filter((a) => a.tekija.trim().toLowerCase() === omaNimi)
    : analyysit;

  return (
    <div className="historia-osio">
      <button type="button" className="nappi nappi-toissijainen sulje-nappi" onClick={onSulje}>
        Sulje
      </button>
      <h2>Kuvahistoria</h2>

      {omaNimi && (
        <label className="historia-suodatin">
          <input type="checkbox" checked={vainOmat} onChange={(e) => setVainOmat(e.target.checked)} />
          Näytä vain omat kuvani
        </label>
      )}

      {lataustila === "lataa" ? (
        <p className="tyhja-tila">Ladataan…</p>
      ) : lataustila === "virhe" ? (
        <p className="halytysbanneri" role="alert">
          Historian lataus epäonnistui.
        </p>
      ) : naytettavat.length === 0 ? (
        <p className="tyhja-tila">Ei vielä kuvia.</p>
      ) : (
        <ul className="historia-lista">
          {naytettavat.map((analyysi) => (
            <li key={analyysi.id} className="historia-rivi">
              <button
                type="button"
                className="historia-avaa"
                onClick={() => setAvoinId(avoinId === analyysi.id ? null : analyysi.id)}
              >
                <img
                  className="historia-pikkukuva"
                  src={`${import.meta.env.VITE_API_URL}/kuvat/${analyysi.tiedostonimi}`}
                  alt=""
                />
                <span className="historia-tiedot">
                  <span className="historia-tekija">{analyysi.tekija}</span>
                  <span className="historia-aika">
                    {new Date(analyysi.aika).toLocaleString("fi-FI")}
                  </span>
                </span>
              </button>

              {avoinId === analyysi.id && (
                <EhdotusLista havainto={analyysi.havainto} ehdotukset={analyysi.ehdotukset} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
