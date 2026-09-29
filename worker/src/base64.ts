// atob käsittelee vain Latin1-merkistöä, joten binääridata (kuvat) puretaan
// suoraan tavuiksi ilman tekstinä tulkintaa.

export function base64ToBytes(base64: string): Uint8Array {
  const binaari = atob(base64.replace(/\n/g, ""));
  const tavut = new Uint8Array(binaari.length);
  for (let i = 0; i < binaari.length; i++) tavut[i] = binaari.charCodeAt(i);
  return tavut;
}

export function bytesToBase64(tavut: Uint8Array): string {
  // btoa vaatii merkkijonon - rakennetaan se paloissa ettei suurilla
  // tiedostoilla (RT-korttien PDF:t) ylitetä funktion argumenttien pinorajaa.
  const PALAN_KOKO = 8192;
  let binaari = "";
  for (let i = 0; i < tavut.length; i += PALAN_KOKO) {
    binaari += String.fromCharCode(...tavut.subarray(i, i + PALAN_KOKO));
  }
  return btoa(binaari);
}
