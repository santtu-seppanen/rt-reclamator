-- Analyysin tila ("nopea" | "taydellinen") tallennetaan jatkossa, jotta
-- palautetta voi verrata sen mukaan oliko sisällönhakutyökalu tarjolla.
-- Vanhoilla riveillä NULL (tila tuntematon).
ALTER TABLE kuvat ADD COLUMN tila TEXT;

-- Tekoälyn kirjoittamat reklamaatioluonnokset (POST /reklamaatio).
-- ehdotus_indeksit = JSON-taulukko kuvat.ehdotukset-indeksejä, jotka
-- käyttäjä valitsi reklamaatioon.
CREATE TABLE reklamaatiot (
  id TEXT PRIMARY KEY,
  kuva_id TEXT NOT NULL REFERENCES kuvat (id),
  ehdotus_indeksit TEXT NOT NULL,
  lisatieto TEXT,
  teksti TEXT NOT NULL,
  tekija TEXT,
  aika TEXT NOT NULL
);

CREATE INDEX idx_reklamaatiot_kuva ON reklamaatiot (kuva_id);

-- Käyttäjien palaute, kysytään vasta reklamaatioluonnoksen jälkeen —
-- rtAnalyysi.ts:n ja reklamaatio.ts:n kehotteiden parantamiseen.
-- ehdotus_indeksi viittaa kuvat.ehdotukset-indeksiin (yksi reklamaatioon
-- valituista); NULL = palaute koskee koko reklamaatioluonnosta.
-- muokattu_teksti = käyttäjän muokkaama lopullinen reklamaatioteksti, jos
-- se poikkeaa luonnoksesta (kertoo suoraan mitä luonnoksessa piti korjata).
CREATE TABLE palaute (
  id TEXT PRIMARY KEY,
  reklamaatio_id TEXT NOT NULL REFERENCES reklamaatiot (id),
  ehdotus_indeksi INTEGER,
  arvio TEXT CHECK (arvio IN ('hyva', 'huono')),
  kommentti TEXT,
  muokattu_teksti TEXT,
  tekija TEXT,
  aika TEXT NOT NULL
);

CREATE INDEX idx_palaute_reklamaatio ON palaute (reklamaatio_id);
CREATE INDEX idx_palaute_aika ON palaute (aika);
