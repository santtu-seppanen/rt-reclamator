/**
 * Pakkaa kameralla otetun tai galleriasta valitun kuvan pienemmäksi ennen
 * lähetystä Workeriin — puhelimen kamerakuva voi olla useita megatavuja,
 * mutta RT-analyysiin ei tarvita täyttä resoluutiota. Tuloksena on aina
 * JPEG, riippumatta alkuperäisestä tiedostomuodosta.
 */

const MAKSIMI_SIVUN_PITUUS_PX = 1600;
const ALOITUS_LAATU = 0.82;
const MIN_LAATU = 0.5;
const LAATU_ASKEL = 0.1;

export interface PakattuKuva {
  data: string;
  tiedostopaate: "jpg";
}

/** Laskee kuvan uuden koon niin, että pidempi sivu on enintään maksimiSivu, säilyttäen kuvasuhteen. */
export function skaalattuKoko(
  leveys: number,
  korkeus: number,
  maksimiSivu: number,
): { leveys: number; korkeus: number } {
  if (leveys <= maksimiSivu && korkeus <= maksimiSivu) return { leveys, korkeus };

  const kerroin = maksimiSivu / Math.max(leveys, korkeus);
  return {
    leveys: Math.round(leveys * kerroin),
    korkeus: Math.round(korkeus * kerroin),
  };
}

function canvasBlobiksi(canvas: HTMLCanvasElement, laatu: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Kuvan pakkaus epäonnistui"))),
      "image/jpeg",
      laatu,
    );
  });
}

function blobiBase64ksi(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const tulos = reader.result;
      if (typeof tulos !== "string") {
        reject(new Error("Kuvan luku epäonnistui"));
        return;
      }
      const pilkku = tulos.indexOf(",");
      resolve(pilkku === -1 ? tulos : tulos.slice(pilkku + 1));
    };
    reader.onerror = () => reject(new Error("Kuvan luku epäonnistui"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Skaalaa kuvan enintään MAKSIMI_SIVUN_PITUUS_PX-kokoiseksi ja pakkaa sen
 * JPEG:ksi, laskien laatua asteittain kunnes tulos mahtuu maksimiTavua-
 * rajan alle (tai laatu saavuttaa alarajansa, jolloin heitetään virhe).
 */
export async function pakkaaKuva(tiedosto: File, maksimiTavua: number): Promise<PakattuKuva> {
  const bittikartta = await createImageBitmap(tiedosto);
  const { leveys, korkeus } = skaalattuKoko(
    bittikartta.width,
    bittikartta.height,
    MAKSIMI_SIVUN_PITUUS_PX,
  );

  const canvas = document.createElement("canvas");
  canvas.width = leveys;
  canvas.height = korkeus;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kuvan pakkaus epäonnistui");
  ctx.drawImage(bittikartta, 0, 0, leveys, korkeus);

  let laatu = ALOITUS_LAATU;
  let blob = await canvasBlobiksi(canvas, laatu);
  while (blob.size > maksimiTavua && laatu > MIN_LAATU) {
    laatu = Math.round((laatu - LAATU_ASKEL) * 100) / 100;
    blob = await canvasBlobiksi(canvas, laatu);
  }

  if (blob.size > maksimiTavua) {
    throw new Error("Kuvaa ei saatu pakattua tarpeeksi pieneksi. Kokeile toista kuvaa.");
  }

  return { data: await blobiBase64ksi(blob), tiedostopaate: "jpg" };
}
