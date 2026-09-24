// atob käsittelee vain Latin1-merkistöä, joten binääridata (kuvat) puretaan
// suoraan tavuiksi ilman tekstinä tulkintaa.

export function base64ToBytes(base64: string): Uint8Array {
  const binaari = atob(base64.replace(/\n/g, ""));
  const tavut = new Uint8Array(binaari.length);
  for (let i = 0; i < binaari.length; i++) tavut[i] = binaari.charCodeAt(i);
  return tavut;
}
