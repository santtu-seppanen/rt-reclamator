import { useState } from "react";
import { Etusivu } from "./features/analyysi/Etusivu";
import { Historia } from "./features/analyysi/Historia";
import { Modaali } from "./lib/Modaali";
import "./App.css";

export function App() {
  const [naytaHistoria, setNaytaHistoria] = useState(false);

  return (
    <main className="sovellus">
      <header className="otsikko">
        <h1>RT Reclamator</h1>
        <p className="alaotsikko">
          Kuvaa remonttikohde, niin sovellus etsii rakennusvirheitä ja ehdottaa RT-kortteja
          sekä lakipykäliä reklamaation tueksi.
        </p>
        <div className="otsikko-napit">
          <button type="button" className="otsikko-linkki" onClick={() => setNaytaHistoria(true)}>
            Historia
          </button>
        </div>
      </header>

      {naytaHistoria && (
        <Modaali onSulje={() => setNaytaHistoria(false)}>
          <Historia onSulje={() => setNaytaHistoria(false)} />
        </Modaali>
      )}

      <Etusivu />
    </main>
  );
}
