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
        <p className="tyhja-tila">Ei tunnistettuja rakennusvirheitä tästä kuvasta.</p>
      ) : (
        <ul className="ehdotus-lista">
          {ehdotukset.map((ehdotus, indeksi) => (
            <li key={indeksi} className={`ehdotus-kortti ehdotus-varmuus-${ehdotus.varmuus}`}>
              <div className="ehdotus-otsikkorivi">
                <span className="ehdotus-aihe">{ehdotus.aihe}</span>
              </div>
              <p className="ehdotus-kuvaus">{ehdotus.kuvaus}</p>
              <div className="ehdotus-viitteet">
                {ehdotus.rtKortti && (
                  <span className="ehdotus-koodi">RT-kortti: {ehdotus.rtKortti}</span>
                )}
                {ehdotus.lakipykala && (
                  <span className="ehdotus-koodi ehdotus-lakipykala">Laki: {ehdotus.lakipykala}</span>
                )}
              </div>
              <span className="ehdotus-varmuus-teksti">{VARMUUS_TEKSTI[ehdotus.varmuus]}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="ehdotus-vastuuvapaus">
        Tekoälyn arvioita, ei lakineuvontaa eikä kortiston suora haku — tarkista aina RT-kortti{" "}
        <a
          href="https://kortistot.rakennustieto.fi/kortistot/rt-kortisto"
          target="_blank"
          rel="noreferrer"
        >
          RT-kortistosta
        </a>{" "}
        ja varmista lakipykälät sekä reklamaation sisältö asiantuntijalta (esim. lakimies tai
        kuluttajaneuvonta) ennen kuin vetoat niihin.
      </p>
    </div>
  );
}
