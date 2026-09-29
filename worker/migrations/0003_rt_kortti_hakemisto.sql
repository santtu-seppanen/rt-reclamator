CREATE TABLE rt_kortti_hakemisto (
  tunnus TEXT PRIMARY KEY,
  otsikko TEXT NOT NULL,
  tyyppi TEXT,
  julkaistu TEXT,
  content_id TEXT,
  paivitetty TEXT NOT NULL
);
