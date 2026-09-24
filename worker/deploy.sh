#!/usr/bin/env bash
# Yhden komennon käyttöönotto/deploy Cloudflare Workerille.
#
# Ajaa kaiken tarvittavan alusta asti: kirjautumisen, D1-tietokannan ja
# R2-kuvavaraston luonnin (jos eivät jo olemassa), migraatioiden ajon,
# salaisuuksien kysymisen (jos eivät jo asetettu) ja lopuksi deployn.
# Turvallinen ajaa uudelleen — jo olemassa olevat resurssit ohitetaan.
#
# Käyttö:
#   cd worker && ./deploy.sh

set -euo pipefail
cd "$(dirname "$0")"

DB_NAME="rt-reclamator-db"
BUCKET_NAME="rt-reclamator-kuvat"
WRANGLER_TOML="wrangler.toml"
PLACEHOLDER="TAYTA_TAMA_WRANGLER_D1_CREATE_KOMENNON_TULOSTEESTA"
UUID_REGEX='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

echo "== Riippuvuudet =="
npm install

echo
echo "== Cloudflare-kirjautuminen =="
if ! npx wrangler whoami >/dev/null 2>&1; then
  npx wrangler login
fi
npx wrangler whoami

echo
echo "== D1-tietokanta ($DB_NAME) =="
if CREATE_OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1); then
  echo "$CREATE_OUTPUT"
  DB_ID=$(echo "$CREATE_OUTPUT" | grep -oE "$UUID_REGEX" | head -n1)
elif echo "$CREATE_OUTPUT" | grep -qi "already exists"; then
  echo "Tietokanta on jo olemassa, haetaan sen id."
  DB_ID=$(npx wrangler d1 list --json | jq -r --arg name "$DB_NAME" '.[] | select(.name == $name) | .uuid' | head -n1)
else
  echo "$CREATE_OUTPUT" >&2
  exit 1
fi

if [ -z "${DB_ID:-}" ]; then
  echo "VIRHE: D1-tietokannan id:tä ei saatu selville." >&2
  exit 1
fi

if grep -q "$PLACEHOLDER" "$WRANGLER_TOML"; then
  sed -i.bak "s/$PLACEHOLDER/$DB_ID/" "$WRANGLER_TOML"
  rm -f "${WRANGLER_TOML}.bak"
  echo "wrangler.toml päivitetty: database_id = $DB_ID"
fi

echo
echo "== R2-kuvavarasto ($BUCKET_NAME) =="
R2_KAYTOSSA=1
if R2_OUTPUT=$(npx wrangler r2 bucket create "$BUCKET_NAME" 2>&1); then
  echo "$R2_OUTPUT"
elif echo "$R2_OUTPUT" | grep -qi "already exists"; then
  echo "R2-kuvavarasto on jo olemassa, jatketaan."
else
  echo "$R2_OUTPUT"
  echo "VAROITUS: R2-kuvavarastoa ei saatu luotua (esim. R2 ei ole vielä otettu käyttöön tilillä) — ohitetaan ja jatketaan ilman kuvatallennusta. Deploy voi silti epäonnistua lopussa, koska wrangler.toml sisältää R2-sidonnan."
  R2_KAYTOSSA=0
fi

echo
echo "== D1-migraatiot =="
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo
echo "== Salaisuudet =="
NYKYISET_SALAISUUDET=$(npx wrangler secret list 2>/dev/null | jq -r '.[].name' 2>/dev/null || echo "")

aseta_salaisuus() {
  local nimi="$1"
  if echo "$NYKYISET_SALAISUUDET" | grep -qx "$nimi"; then
    echo "$nimi on jo asetettu — ohitetaan (vaihtaaksesi: wrangler secret put $nimi)"
    return
  fi
  echo "Anna arvo salaisuudelle $nimi:"
  npx wrangler secret put "$nimi"
}

aseta_salaisuus "JAETTU_SALASANA"
aseta_salaisuus "ANTHROPIC_API_KEY"

echo
echo "== Deploy =="
DEPLOY_OUTPUT=$(npx wrangler deploy 2>&1 | tee /dev/stderr)
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -n1)

echo
echo "== Valmis =="
if [ -n "$WORKER_URL" ]; then
  echo "Worker on julkaistu: $WORKER_URL"
  echo "Aseta tämä app/.env.local:iin ja GitHub Actions -buildin ympäristömuuttujaksi:"
  echo "  VITE_API_URL=$WORKER_URL"
else
  echo "Deploy valmis. Katso Workerin URL yllä olevasta tulosteesta ja aseta se"
  echo "VITE_API_URL-muuttujaksi app/.env.local:iin ja GitHub Actionsiin."
fi

if [ "$R2_KAYTOSSA" -eq 0 ]; then
  echo
  echo "HUOM: R2-kuvavarasto ohitettiin. Remonttikuvat (GET /kuvat/:tiedostonimi) eivät toimi"
  echo "ennen kuin R2 otetaan käyttöön Cloudflare-dashboardista ja ./deploy.sh ajetaan uudelleen."
fi
