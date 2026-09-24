import type { RtEhdotus, Varmuus } from "./types";

const VARMUUS_TEKSTI: Record<Varmuus, string> = {
  korkea: "Korkea varmuus",
  keskitaso: "Keskitason varmuus",
  matala: "Matala varmuus",
};

interface EhdotusListaProps {
  havainto: string;
  ehdotukset: RtEhdotus[];
}

/** Näyttää yhden kuvan analyysin: mallin havainto kuvasta ja RT-korttiehdotukset. */
export function EhdotusLista({ havainto, ehdotukset }: EhdotusListaProps) {
  return (
    <div className="ehdotus-lista-kontti">
      <p className="havainto">{havainto}</p>

      {ehdotukset.length === 0 ? (
        <p className="tyhja-tila">Ei tunnistettuja RT-kortteja tästä kuvasta.</p>
      ) : (
        <ul className="ehdotus-lista">
          {ehdotukset.map((ehdotus, indeksi) => (
            <li key={indeksi} className={`ehdotus-kortti ehdotus-varmuus-${ehdotus.varmuus}`}>
              <div className="ehdotus-otsikkorivi">
                <span className="ehdotus-aihe">{ehdotus.aihe}</span>
                {ehdotus.rtKortti && <span className="ehdotus-koodi">{ehdotus.rtKortti}</span>}
              </div>
              <p className="ehdotus-kuvaus">{ehdotus.kuvaus}</p>
              <span className="ehdotus-varmuus-teksti">{VARMUUS_TEKSTI[ehdotus.varmuus]}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="ehdotus-vastuuvapaus">
        Tekoälyn ehdottamat — tarkista aina lopullinen kortti{" "}
        <a
          href="https://kortistot.rakennustieto.fi/kortistot/rt-kortisto"
          target="_blank"
          rel="noreferrer"
        >
          RT-kortistosta
        </a>
        .
      </p>
    </div>
  );
}
