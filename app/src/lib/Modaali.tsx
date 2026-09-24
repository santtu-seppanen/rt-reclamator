import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

interface ModaaliProps {
  onSulje: () => void;
  children: ReactNode;
}

/**
 * Täyden ruudun modaali-ikkuna natiivilla <dialog>-elementillä.
 *
 * Aiempi versio pyöri itse rakennetulla position:fixed-kerroksella ja
 * body { overflow: hidden } -vierityslukolla — se aiheutti toistuvia,
 * selainkohtaisia bugeja (mm. taustan vierityksen nollautuminen, sisällön
 * piiloutuminen näppäimistön/navigointipalkin taakse) sekä Androidilla että
 * Firefoxissa. <dialog>.showModal() renderöityy selaimen "top layerissa",
 * jonka selainvalmistajat ovat nimenomaan suunnitelleet väistämään
 * näytön näppäimistön/työkalurivin — sinne ei tarvitse itse rakentaa
 * vierityslukkoa tai kohdistuslogiikkaa.
 */
export function Modaali({ onSulje, children }: ModaaliProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // onSulje on tyypillisesti kutsujassa inline-nuolifunktio eli uusi
  // referenssi joka renderillä. Jos se olisi alla olevan efektin
  // riippuvuuksissa, efekti ajaisi cleanupin (dialog.close()) aina kun
  // kutsuja renderöityy uudelleen (esim. sijainnin päivittyessä) — close()
  // laukaisee natiivin "close"-tapahtuman heti, joka sulkisi modaalin
  // käytännössä välittömästi avaamisen jälkeen. Pidetään siksi tuorein
  // onSulje refissä ja ajetaan avaus/sulkeutumis-efekti vain kerran.
  const onSuljeRef = useRef(onSulje);
  useEffect(() => {
    onSuljeRef.current = onSulje;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    // tabIndex=-1 pitäisi jo yksin riittää ohjaamaan showModal():n
    // automaattisen fokusoinnin dialogiin ensimmäisen kentän sijaan, mutta
    // varmistetaan se vielä eksplisiittisesti — eri selaimet tulkitsevat
    // fokusointialgoritmin hieman eri tavoin.
    dialog.focus();

    function kasitteleSulkeutuminen() {
      onSuljeRef.current();
    }
    dialog.addEventListener("close", kasitteleSulkeutuminen);

    return () => {
      dialog.removeEventListener("close", kasitteleSulkeutuminen);
      dialog.close();
    };
  }, []);

  function kasitteleTaustaKlikkaus(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onSulje();
  }

  return (
    // tabIndex="-1" tekee dialogista fokusoitavan, jolloin showModal():n
    // automaattinen fokusointi kohdistuu itse dialogiin eikä ensimmäiseen
    // sisällä olevaan tekstikenttään (mikä avaisi näppäimistön heti).
    <dialog
      ref={dialogRef}
      className="modaali-tausta"
      tabIndex={-1}
      onClick={kasitteleTaustaKlikkaus}
    >
      <div className="modaali-sisalto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </dialog>
  );
}
