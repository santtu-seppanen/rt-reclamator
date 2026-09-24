import { describe, it, expect } from "vitest";
import { skaalattuKoko } from "./kuvaPakkaus";

describe("skaalattuKoko", () => {
  it("ei muuta kokoa kun kuva jo mahtuu rajaan", () => {
    expect(skaalattuKoko(800, 600, 1600)).toEqual({ leveys: 800, korkeus: 600 });
  });

  it("skaalaa leveämmän sivun mukaan säilyttäen kuvasuhteen", () => {
    expect(skaalattuKoko(3200, 1600, 1600)).toEqual({ leveys: 1600, korkeus: 800 });
  });

  it("skaalaa korkeamman sivun mukaan säilyttäen kuvasuhteen", () => {
    expect(skaalattuKoko(1600, 3200, 1600)).toEqual({ leveys: 800, korkeus: 1600 });
  });

  it("skaalaa neliökuvan molemmilta sivuilta yhtä paljon", () => {
    expect(skaalattuKoko(4000, 4000, 1600)).toEqual({ leveys: 1600, korkeus: 1600 });
  });

  it("hyväksyy täsmälleen rajan kokoisen kuvan sellaisenaan", () => {
    expect(skaalattuKoko(1600, 1600, 1600)).toEqual({ leveys: 1600, korkeus: 1600 });
  });
});
