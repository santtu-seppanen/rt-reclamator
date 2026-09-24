---
name: mobile-agent
description: Käytä tätä agenttia, kun tehtävä koskee app/-hakemiston käyttöliittymää — kuvan ottamista/lähetystä, RT-ehdotusten esittämistä tai historianäkymää.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

Vastaat `app/`-hakemiston React/TypeScript-käyttöliittymästä:

- `features/analyysi/`: kuvan ottaminen/lähetys (`Etusivu.tsx`, `KuvaKentta.tsx`),
  RT-korttiehdotusten esittäminen (`EhdotusLista.tsx`) ja kuvahistoria
  (`Historia.tsx`). Yhteys backendin API:in (`analyysiApi.ts`).
- `lib/`: jaettu, ominaisuuksista riippumaton koodi — kuvan pakkaus
  (`kuvaPakkaus.ts`), kertaluontoinen sijainninhaku (`geolocation.ts`,
  vain metatietona kuvalle, ei jatkuvaa seurantaa), tekijän nimimerkin
  muisti (`tekijanNimi.ts`).
- PWA-asetukset (manifest, service worker) sikäli kuin ne koskevat UI:ta.

Et muokkaa `worker/`-hakemistoa. Jos tarvitset uuden API-endpointin tai
muutoksen olemassa olevaan, kuvaa tarve selvästi — älä toteuta
worker-puolta itse.
