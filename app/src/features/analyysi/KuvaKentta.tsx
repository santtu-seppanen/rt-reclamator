import { useRef, useState } from "react";
import type { ChangeEvent } from "react";

interface KuvaKenttaProps {
  onValitse: (tiedosto: File | null) => void;
  vihjeTeksti?: string;
}

function KameraKuvake() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      aria-hidden="true"
    >
      <path d="M4 8a2 2 0 0 1 2-2h1.17a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 11.317 3h1.366a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.83 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function GalleriaKuvake() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </svg>
  );
}

/** Kuvan valintakenttä: oma nappi kameralla ottamiseen (oletus) ja toinen tiedoston/galleriasta valintaan. */
export function KuvaKentta({ onValitse, vihjeTeksti }: KuvaKenttaProps) {
  const [esikatselu, setEsikatselu] = useState<string | null>(null);
  const kameraInputRef = useRef<HTMLInputElement>(null);
  const tiedostoInputRef = useRef<HTMLInputElement>(null);

  async function kasitteleValinta(e: ChangeEvent<HTMLInputElement>) {
    const tiedosto = e.target.files?.[0] ?? null;
    e.target.value = "";
    onValitse(tiedosto);

    if (!tiedosto) {
      setEsikatselu(null);
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Kuvan luku epäonnistui"));
        reader.readAsDataURL(tiedosto);
      });
      setEsikatselu(dataUrl);
    } catch {
      setEsikatselu(null);
    }
  }

  return (
    <div className="kentta">
      <span className="kentan-nimi">Remonttikuva</span>

      <div className="kuva-valinta-napit">
        <button
          type="button"
          className="nappi nappi-toissijainen kuva-valinta-nappi"
          onClick={() => kameraInputRef.current?.click()}
          aria-label="Ota kuva kameralla"
          title="Ota kuva kameralla"
        >
          <KameraKuvake />
        </button>
        <button
          type="button"
          className="nappi nappi-toissijainen kuva-valinta-nappi"
          onClick={() => tiedostoInputRef.current?.click()}
          aria-label="Valitse kuva tiedostosta"
          title="Valitse kuva tiedostosta"
        >
          <GalleriaKuvake />
        </button>
      </div>

      <input
        ref={kameraInputRef}
        className="tiedostosyote-piilotettu"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={kasitteleValinta}
      />
      <input
        ref={tiedostoInputRef}
        className="tiedostosyote-piilotettu"
        type="file"
        accept="image/*"
        onChange={kasitteleValinta}
      />

      {vihjeTeksti && <span className="kentan-vihje">{vihjeTeksti}</span>}

      {esikatselu && (
        <img className="kuva-esikatselu" src={esikatselu} alt="Esikatselu otetusta remonttikuvasta" />
      )}
    </div>
  );
}
