CREATE TABLE kuvat (
  id TEXT PRIMARY KEY,
  tekija TEXT NOT NULL,
  tiedostonimi TEXT NOT NULL,
  muistiinpano TEXT,
  lat REAL,
  lng REAL,
  havainto TEXT NOT NULL,
  ehdotukset TEXT NOT NULL,
  aika TEXT NOT NULL
);

CREATE INDEX idx_kuvat_aika ON kuvat (aika);
