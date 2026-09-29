#!/usr/bin/env python3
"""Hakee RT-kortteja kortistot.rakennustieto.fi-sivustolta nimellä tai asteriskilla.

Käyttö:
    RAKENNUSTIETO_USERNAME=tunnus RAKENNUSTIETO_PASSWORD=salasana \
        python3 scripts/hae_rt_kortteja.py "vesikatto"
    python3 scripts/hae_rt_kortteja.py "vesi*"          # asteriskihaku (muista lainausmerkit!)
    python3 scripts/hae_rt_kortteja.py "vesikatto" --json
    python3 scripts/hae_rt_kortteja.py "vesikatto" --kaikki-tyypit  # myös Ratu/KH/RYL-kortit
    python3 scripts/hae_rt_kortteja.py "vesi*" --hakemisto ~/rt-kortit  # lataa PDF:t (vaatii kirjautumisen)

Kirjautuminen (RAKENNUSTIETO_USERNAME/RAKENNUSTIETO_PASSWORD) on valinnainen:
haku itsessään palauttaa kortin metatiedot (nimi, kuvaus, tunnus, julkaisupäivä)
myös kirjautumatta. Kortin varsinainen sisältö (PDF) on lisenssin takana, joten
kirjautuminen vaaditaan vain sen katseluun kortistot.rakennustieto.fi:ssä.

Vaihtoehtoisesti tunnukset voi kirjoittaa (editorilla, ei shellin kautta)
tiedostoon scripts/rt-tunnukset.local:
    RAKENNUSTIETO_USERNAME=tunnus
    RAKENNUSTIETO_PASSWORD=salasana
Tiedosto on gitignoroitu (*.local).
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://kortistot.rakennustieto.fi"
AUTH_BASE = "https://auth.rakennustieto.fi"
USER_AGENT = "rt-reclamator-hae-rt-kortteja/1.0"

# *.local on gitignoroitu (ks. .gitignore) - tunnukset voi kirjoittaa tähän
# tiedostoon suoraan editorilla sen sijaan että ne kulkisivat shellin/chatin kautta.
TUNNUSTIEDOSTO = os.path.join(os.path.dirname(__file__), "rt-tunnukset.local")


def lue_tunnukset():
    """Palauttaa (kayttajatunnus, salasana) ympäristömuuttujista tai TUNNUSTIEDOSTOsta."""
    kayttajatunnus = os.environ.get("RAKENNUSTIETO_USERNAME")
    salasana = os.environ.get("RAKENNUSTIETO_PASSWORD")
    if kayttajatunnus and salasana:
        return kayttajatunnus, salasana
    if os.path.isfile(TUNNUSTIEDOSTO):
        arvot = {}
        with open(TUNNUSTIEDOSTO, encoding="utf-8") as f:
            for rivi in f:
                rivi = rivi.strip()
                if not rivi or rivi.startswith("#") or "=" not in rivi:
                    continue
                avain, arvo = rivi.split("=", 1)
                arvot[avain.strip()] = arvo.strip().strip('"').strip("'")
        kayttajatunnus = arvot.get("RAKENNUSTIETO_USERNAME")
        salasana = arvot.get("RAKENNUSTIETO_PASSWORD")
    return kayttajatunnus, salasana

# Hakutulossivu on Next.js-SSR-sivu: tulosdata ei tule erillisestä API-kutsusta
# vaan on upotettuna sivun mukana tulevaan React Server Component -streamiin
# (script self.__next_f.push([...])-kutsuina). Tämä poimii sieltä "initialSearchData"-JSONin.
NEXT_F_RE = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)\s*</script>', re.S)


def _request(opener, url, data=None, headers=None):
    # Accept: text/html on pakollinen - ilman sitä UAA/Cognito-kirjautumisketju
    # tulkitsee pyynnön API-kutsuksi ja vastaa 401:llä lomakkeen näyttämisen sijaan.
    hdrs = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    if headers:
        hdrs.update(headers)
    return opener.open(urllib.request.Request(url, data=data, headers=hdrs), timeout=30)


def uusi_istunto():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def kirjaudu_sisaan(opener, kayttajatunnus, salasana):
    """Kirjautuu sisään sivuston SSO:hon (NextAuth -> AWS Cognito -> Rakennustieto-UAA).

    Ketju on moniportainen uudelleenohjaus eri aliverkkotunnusten välillä;
    urllib seuraa uudelleenohjaukset ja evästeet automaattisesti, mutta
    lomakkeiden _csrf/csrfToken-arvot pitää poimia käsin matkan varrella.
    """
    with _request(opener, f"{BASE}/api/auth/csrf") as resp:
        csrf_token = json.loads(resp.read())["csrfToken"]

    body = urllib.parse.urlencode({"csrfToken": csrf_token, "callbackUrl": BASE}).encode()
    with _request(
        opener,
        f"{BASE}/api/auth/signin/RT-old",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": BASE},
    ) as resp:
        login_html = resp.read().decode("utf-8", "replace")
        paatepiste = resp.geturl()

    if not paatepiste.startswith(f"{AUTH_BASE}/login"):
        raise RuntimeError(f"odottamaton uudelleenohjaus kirjautumisessa ({paatepiste})")

    # Sivulla on kolme lomaketta (tunnus/salasana, AD-sähköposti, IP-kirjautuminen) -
    # poimitaan nimenomaan tunnus/salasana-lomakkeen _csrf.
    match = re.search(
        r'<form action="/login" method="post">'
        r'<input type="hidden" name="_csrf" value="([^"]+)"/>'
        r'.*?name="username".*?name="password"',
        login_html,
        re.S,
    )
    if not match:
        raise RuntimeError("kirjautumislomaketta ei löytynyt - sivuston kirjautuminen on saattanut muuttua")
    uaa_csrf = match.group(1)

    body = urllib.parse.urlencode(
        {"_csrf": uaa_csrf, "username": kayttajatunnus, "password": salasana}
    ).encode()
    _request(
        opener,
        f"{AUTH_BASE}/login",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": paatepiste},
    ).close()

    with _request(opener, f"{BASE}/api/auth/session") as resp:
        istunto = json.loads(resp.read())
    if not istunto:
        raise RuntimeError("väärä käyttäjätunnus tai salasana")


def _poimi_hakudata(html):
    for raw in NEXT_F_RE.findall(html):
        if "initialSearchData" not in raw:
            continue
        try:
            decoded = json.loads('"' + raw + '"')
        except json.JSONDecodeError:
            continue
        alku = decoded.find('{"products"')
        if alku == -1:
            continue
        syvyys = 0
        loppu = None
        for i, merkki in enumerate(decoded[alku:], start=alku):
            if merkki == "{":
                syvyys += 1
            elif merkki == "}":
                syvyys -= 1
                if syvyys == 0:
                    loppu = i + 1
                    break
        if loppu is None:
            continue
        try:
            return json.loads(decoded[alku:loppu])
        except json.JSONDecodeError:
            continue
    raise RuntimeError("hakutuloksia ei löytynyt sivun rakenteesta - sivusto on saattanut muuttua")


def hae_sivu(opener, hakusana, sivu):
    url = f"{BASE}/search?q={urllib.parse.quote(hakusana)}&page={sivu}"
    with _request(opener, url) as resp:
        html = resp.read().decode("utf-8", "replace")
    return _poimi_hakudata(html)


def hae_kortteja(opener, hakusana, max_sivuja, vain_rt):
    kortit = []
    sivu = 1
    kokonaismaara = 0
    while True:
        data = hae_sivu(opener, hakusana, sivu)
        kortit.extend(data["products"])
        sivutus = data["pagination"]
        kokonaismaara = sivutus["total_count"]
        if sivu >= sivutus["pages_count"] or sivu >= max_sivuja:
            break
        sivu += 1
        time.sleep(0.5)
    if vain_rt:
        kortit = [k for k in kortit if (k.get("CardReferenceCode") or "").startswith("RT ")]
    return kortit, kokonaismaara


def _turvallinen_tiedostonimi(tunnus):
    return re.sub(r'[\\/:*?"<>|]', "-", tunnus).strip()


def lataa_kortti(opener, kortti, hakemisto):
    """Lataa yhden kortin PDF-tiedoston /api/content/<contentId>-rajapinnasta.

    Rajapinta löytyi sivuston omasta JS-paketista (DownloadButton-komponentti,
    app/kortit/[id]/page-*.js) - sama polku jota "Lataa PDF" -nappi käyttää.
    Palauttaa (onnistuiko, polku_tai_virhe).
    """
    content_id = kortti.get("contentId")
    tunnus = kortti.get("CardReferenceCode") or kortti.get("ProductID") or "tuntematon"
    if not content_id:
        return False, "ei contentId-kenttää - ei ladattavaa tiedostoa"
    polku = os.path.join(hakemisto, _turvallinen_tiedostonimi(tunnus) + ".pdf")
    try:
        with _request(opener, f"{BASE}/api/content/{content_id}") as resp:
            if "pdf" not in (resp.headers.get("Content-Type") or "").lower():
                return False, f"vastaus ei ollut PDF (Content-Type: {resp.headers.get('Content-Type')})"
            data = resp.read()
    except urllib.error.HTTPError as virhe:
        if virhe.code in (401, 403):
            return False, "ei lisenssiä/oikeuksia tähän korttiin"
        return False, f"HTTP {virhe.code}"
    with open(polku, "wb") as f:
        f.write(data)
    return True, polku


def tulosta(kortit, json_muoto):
    if json_muoto:
        print(json.dumps(kortit, ensure_ascii=False, indent=2))
        return
    for kortti in kortit:
        tunnus = kortti.get("CardReferenceCode") or "?"
        url = f"{BASE}/kortit/{urllib.parse.quote(tunnus)}"
        print(f"{tunnus}  [{kortti.get('ProductType', '?')}]  {kortti.get('PublicationDate', '')}")
        print(f"  {kortti.get('ProductName', '')}")
        print(f"  {url}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("hakusana", help='Hakusana tai osa siitä, esim. "vesikatto" tai "vesi*"')
    parser.add_argument(
        "--kaikki-tyypit",
        action="store_true",
        help="Älä rajaa tuloksia RT-kortteihin (näytä myös Ratu-, KH- ja RYL-osumat)",
    )
    parser.add_argument(
        "--sivuja", type=int, default=5, help="Montako 15 osuman hakutulossivua haetaan enintään (oletus 5)"
    )
    parser.add_argument("--json", action="store_true", help="Tulosta täysi hakudata JSON-muodossa")
    parser.add_argument(
        "--hakemisto",
        metavar="POLKU",
        help="Lataa osumien PDF-tiedostot tähän hakemistoon (vaatii onnistuneen kirjautumisen ja lisenssin)",
    )
    args = parser.parse_args()

    opener = uusi_istunto()
    kirjautunut = False

    kayttajatunnus, salasana = lue_tunnukset()
    if kayttajatunnus and salasana:
        try:
            kirjaudu_sisaan(opener, kayttajatunnus, salasana)
            kirjautunut = True
            print("Kirjauduttu sisään onnistuneesti.", file=sys.stderr)
        except Exception as virhe:  # sivuston kirjautumisen sisäiset yksityiskohdat voivat muuttua
            print(f"Varoitus: kirjautuminen epäonnistui ({virhe}) - jatketaan kirjautumatta.", file=sys.stderr)
    else:
        print(
            "Huom: RAKENNUSTIETO_USERNAME/RAKENNUSTIETO_PASSWORD ei asetettu - haku tehdään kirjautumatta "
            "(hakutulosten metatiedot näkyvät silti, kortin sisältö vaatii lisenssin).",
            file=sys.stderr,
        )

    if args.hakemisto and not kirjautunut:
        print("Virhe: --hakemisto vaatii onnistuneen kirjautumisen.", file=sys.stderr)
        sys.exit(1)

    try:
        kortit, kokonaismaara = hae_kortteja(
            opener, args.hakusana, args.sivuja, vain_rt=not args.kaikki_tyypit
        )
    except urllib.error.HTTPError as virhe:
        print(f"Virhe haussa: HTTP {virhe.code}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as virhe:
        print(f"Virhe haussa: {virhe.reason}", file=sys.stderr)
        sys.exit(1)

    tulosta(kortit, args.json)
    print(f"\n{len(kortit)} korttia näytetty (hakuosumia yhteensä {kokonaismaara}).", file=sys.stderr)

    if args.hakemisto:
        os.makedirs(args.hakemisto, exist_ok=True)
        print(f"\nLadataan {len(kortit)} korttia hakemistoon {args.hakemisto}...", file=sys.stderr)
        onnistui = 0
        for kortti in kortit:
            tunnus = kortti.get("CardReferenceCode") or "?"
            ok, tulos = lataa_kortti(opener, kortti, args.hakemisto)
            if ok:
                onnistui += 1
                print(f"  Ladattu: {tunnus} -> {tulos}", file=sys.stderr)
            else:
                print(f"  Ohitettu: {tunnus} ({tulos})", file=sys.stderr)
            time.sleep(0.5)
        print(f"\n{onnistui}/{len(kortit)} tiedostoa ladattu onnistuneesti.", file=sys.stderr)


if __name__ == "__main__":
    main()
