import { useState } from "react";
import type { RtEhdotus, RtKorttiVastaus, Varmuus } from "./types";
import { haeRtKortinSisalto } from "./analyysiApi";
import { Modaali } from "../../lib/Modaali";

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
  // Kevyt komponentin sisäinen välimuisti tunnuksen mukaan — Worker
  // välimuistittaa haun jo D1:een, mutta turha verkkokutsu kannattaa
  // silti välttää jos käyttäjä avaa/sulkee saman kortin moneen kertaan.
  const [valimuisti, setValimuisti] = useState<Record<string, RtKorttiVastaus>>({});
  const [avoinTunnus, setAvoinTunnus] = useState<string | null>(null);
  const [lataaTunnus, setLataaTunnus] = useState<string | null>(null);
  const [virheTunnus, setVirheTunnus] = useState<Record<string, string>>({});

  async function haeKortti(tunnus: string) {
    if (valimuisti[tunnus]) {
      setAvoinTunnus(tunnus);
      return;
    }

    setLataaTunnus(tunnus);
    setVirheTunnus((edelliset) => {
      const uudet = { ...edelliset };
      delete uudet[tunnus];
      return uudet;
    });

    try {
      const vastaus = await haeRtKortinSisalto(tunnus);
      setValimuisti((edelliset) => ({ ...edelliset, [tunnus]: vastaus }));
      setAvoinTunnus(tunnus);
    } catch (virhe) {
      setVirheTunnus((edelliset) => ({
        ...edelliset,
        [tunnus]: virhe instanceof Error ? virhe.message : "Kortin haku epäonnistui",
      }));
    } finally {
      setLataaTunnus(null);
    }
  }

  const avoinKortti = avoinTunnus ? valimuisti[avoinTunnus] : null;

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
              {ehdotus.rtKortti && (
                <div className="ehdotus-toiminnot">
                  <button
                    type="button"
                    className="nappi nappi-toissijainen rt-kortti-nappi"
                    disabled={lataaTunnus === ehdotus.rtKortti}
                    onClick={() => haeKortti(ehdotus.rtKortti!)}
                  >
                    {lataaTunnus === ehdotus.rtKortti ? "Haetaan…" : "Hae kortin sisältö"}
                  </button>
                  {virheTunnus[ehdotus.rtKortti] && (
                    <p className="lomake-virhe">{virheTunnus[ehdotus.rtKortti]}</p>
                  )}
                </div>
              )}
              <span className="ehdotus-varmuus-teksti">{VARMUUS_TEKSTI[ehdotus.varmuus]}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="ehdotus-vastuuvapaus">
        Tekoälyn arvioita, ei lakineuvontaa. Yllä olevat RT-kortti- ja lakipykäläehdotukset ovat
        mallin arvauksia tunnuksesta, ei kortiston suora haku. "Hae kortin sisältö" -painike sen
        sijaan hakee oikean kortin{" "}
        <a
          href="https://kortistot.rakennustieto.fi/kortistot/rt-kortisto"
          target="_blank"
          rel="noreferrer"
        >
          RT-kortistosta
        </a>{" "}
        ja tiivistää sen tekoälyllä — sekin on siis tiivistelmä, ei sanasta sanaan kortin teksti.
        Varmista joka tapauksessa lakipykälät sekä reklamaation sisältö itse kortista tai
        asiantuntijalta (esim. lakimies tai kuluttajaneuvonta) ennen kuin vetoat niihin.
      </p>

      {avoinTunnus && avoinKortti && (
        <Modaali onSulje={() => setAvoinTunnus(null)}>
          <div className="rt-kortti-sisalto">
            <button
              type="button"
              className="nappi nappi-toissijainen sulje-nappi"
              onClick={() => setAvoinTunnus(null)}
            >
              Sulje
            </button>
            <h2>{avoinKortti.tunnus}</h2>
            <h3>{avoinKortti.otsikko}</h3>
            <p>{avoinKortti.tiivistelma}</p>
            <p className="ehdotus-vastuuvapaus">
              Tekoälyn tiivistelmä kortin sisällöstä, ei sanasta sanaan kortin teksti — varmista
              yksityiskohdat ja lakipykälät itse kortista tai asiantuntijalta.
            </p>
          </div>
        </Modaali>
      )}
    </div>
  );
}
