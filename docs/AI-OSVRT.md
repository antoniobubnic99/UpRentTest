# Osvrt na korištene AI alate

## Alati

| Alat | Za što |
|---|---|
| **Claude (Anthropic, model Opus)** u agentnom načinu rada, s pristupom terminalu, gitu i pregledniku | Analiza zadatka iz maila, odabir pristupa, Python referentna implementacija, TypeScript solver, validator, testovi, React UI, dokumentacija |
| **Playwright + headless Chrome** (pokreće AI) | Screenshotovi i vizualna provjera UI-ja |
| **Claude in Chrome** | Očitavanje boja i fonta sa stranice uprent.hr, kako bi UI bio u Up Rent stilu |

## Moja uloga

- Definirao sam cilj, ograničenja i kriterije kvalitete, a odluke sam donosio sam:
  - egzaktni solver umjesto heuristike
  - tumačenje limita od 9 h
  - stack: React + TS + Vercel, bez backenda
- Pregledao sam međurezultate, tražio objašnjenja i usmjeravao dorade.
- AI je radio implementaciju, a ja sam provjeravao rezultate na načine navedene u nastavku.

## Kako su rezultati AI-ja provjereni

AI-generiranom kodu nisam vjerovao "na riječ". Svaki ključni rezultat provjeren je na barem dva neovisna načina:

1. **Dvije neovisne implementacije.** Prije pisanja aplikacije optimum je izračunat zasebnom Python skriptom (`tools/reference_check.py`), drukčije strukturiranom od TypeScript solvera. Obje daju **iste kilometre i iste rute**: 200,1 km i 182,2 km.
2. **Brute force usporedba.** Test na 25 nasumičnih instanci uspoređuje solver s naivnom pretragom svih raspodjela i svih redoslijeda radnji. Brute force je dovoljno jednostavan da mu se može vjerovati čitanjem.
3. **Nezavisni validator.** `validatePlan` ne koristi solver, nego ponovno prolazi svaku rutu i provjerava sva poslovna pravila. Pokreće se u testovima i u aplikaciji nakon svake optimizacije.
4. **Testovi poslovnih pravila** (41 test case) za nosivost, broj strojeva, preuzimanje prije isporuke istim kamionom, bazu, dnevni limit i neizvršive naloge.
5. **Ručna provjera:**
   - dionica L0–L1 = √(3² + 8²) = √73 = 8,544, zaokruženo **8,5 km** ✔
   - kamion B s limitom: 162,9 km / 60 = 2,715 h, plus 18 radnji × 20 min = 6 h, ukupno **8,71 h ≤ 9 h** ✔
   - bez limita: 182,2 km / 60 = 3,04 h, plus 20 × 20 min = 6,67 h, ukupno **9,70 h > 9 h**. To je razlog zašto 182,2 km nije prihvatljiv uz realno tumačenje limita ✔
   - M10 (9.400 kg) + najlakši M01 (800 kg) = 10.200 kg > 10.000 kg, pa M10 uvijek putuje sam ✔
6. **Vizualna provjera UI-ja.** Screenshotovi su pronašli stvarnu grešku: oznaka "Podaci su promijenjeni" pojavljivala se odmah pri prvom učitavanju, zbog dvije različite kopije početnih podataka. Greška je ispravljena, a scenarij s preteškim strojem provjeren je klikom u pregledniku.

## Zaključak

AI je značajno ubrzao implementaciju. Kvaliteta rješenja ipak dolazi iz toga što je svaki rezultat **provjerljiv**: egzaktan algoritam, dvije neovisne implementacije, brute force, validator i testovi. Tako i greška AI-ja ne bi mogla proći neopaženo.
