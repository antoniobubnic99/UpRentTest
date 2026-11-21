# Osvrt na korištene AI alate

## Alati

| Alat | Za što |
|---|---|
| **Claude (Anthropic, model Opus)** u agentnom načinu rada, s pristupom terminalu, gitu i pregledniku | Analiza zadatka iz maila, odabir pristupa, Python referentna implementacija, TypeScript solver, validator, testovi, React UI, dokumentacija |
| **Playwright + headless Chrome** (pokreće AI) | Screenshotovi i vizualna provjera UI-ja |
| **Claude in Chrome** | Očitavanje boja, fonta, izgleda headera i logotipa sa stranice uprent.hr, kako bi UI bio u Up Rent stilu |

## Moja uloga

- Zadao sam cilj i kriterije: točnost iznad svega, rješenje koje mogu obraniti i izgled usklađen s Up Rentom.
- AI je predložio pristup:
  - egzaktni solver umjesto heuristike
  - tumačenje limita od 9 h kao ukupnog radnog vremena vozača
  - stack React + TypeScript + Vercel, bez backenda

  Prijedloge sam procijenio i prihvatio, jer tako uobičajeno pristupam projektima: prvo jasno definiram pretpostavke, zatim biram rješenje čiji se rezultat može provjeriti, a jednostavnu arhitekturu stavljam ispred složene.
- Usmjeravao sam rad, provjeravao međurezultate i odlučivao o predaji, deployu i doradama.
- Za drugu fazu sam nakon pregleda aplikacije definirao 10 zahtjeva za dorade i donio odluke o otvorenim pitanjima:
  - pauza kao opcija, po defaultu isključena
  - raspored ekrana
  - automatski odabir solvera
  - karte i geokodiranje
  - logo uz napomenu da je riječ o prototipu

## Kako su rezultati AI-ja provjereni

AI-generiranom kodu nisam vjerovao "na riječ". Svaki ključni rezultat provjeren je na barem dva neovisna načina:

1. **Dvije neovisne implementacije.** Prije pisanja aplikacije optimum je izračunat zasebnom Python skriptom (`tools/reference_check.py`), drukčije strukturiranom od TypeScript solvera. Obje daju **iste kilometre i iste rute**: 200,1 km i 182,2 km.
2. **Brute force usporedba.** Test na 25 nasumičnih instanci uspoređuje solver s naivnom pretragom svih raspodjela i svih redoslijeda radnji. Brute force je dovoljno jednostavan da mu se može vjerovati čitanjem.
3. **Nezavisni validator.** `validatePlan` ne koristi solver, nego ponovno prolazi svaku rutu i provjerava sva poslovna pravila. Pokreće se u testovima i u aplikaciji nakon svake optimizacije.
4. **Testovi poslovnih pravila** (u prvoj fazi 41 test case) za nosivost, broj strojeva, preuzimanje prije isporuke istim kamionom, bazu, dnevni limit i neizvršive naloge.
5. **Ručna provjera:**
   - dionica L0–L1 = √(3² + 8²) = √73 = 8,544, zaokruženo **8,5 km** ✔
   - kamion B s limitom: 162,9 km / 60 = 2,715 h, plus 18 radnji × 20 min = 6 h, ukupno **8,71 h ≤ 9 h** ✔
   - bez limita: 182,2 km / 60 = 3,04 h, plus 20 × 20 min = 6,67 h, ukupno **9,70 h > 9 h**. To je razlog zašto 182,2 km nije prihvatljiv uz realno tumačenje limita ✔
   - M10 (9.400 kg) + najlakši M01 (800 kg) = 10.200 kg > 10.000 kg, pa M10 uvijek putuje sam ✔
6. **Vizualna provjera UI-ja.** Screenshotovi su pronašli stvarnu grešku: oznaka "Podaci su promijenjeni" pojavljivala se odmah pri prvom učitavanju, zbog dvije različite kopije početnih podataka. Greška je ispravljena, a scenarij s preteškim strojem provjeren je klikom u pregledniku.

## Druga faza (dorade)

AI je implementirao dorade prema mojim zahtjevima i odlukama. Svaka nova funkcionalnost provjerena je na isti način kao i prva faza:

1. **Nove brojke prvo su izračunate referentnom Python logikom**, a tek onda implementirane:
   - pauza od 30 min daje **217,0 km**; scenarij je dodan u `tools/reference_check.py`
   - utovar N09 od 60 min daje 217,0 km
   - zadatak bez lokacije L3 daje 154,9 km
2. **Egzaktni solver za 3 vozila** uspoređen je s brute force pretragom na 12 nasumičnih instanci.
3. **Heuristika je mjerena prema egzaktnom solveru.** Mjerenje je otkrilo da je prva verzija preslaba: na 60 instanci najgore je bila 70 % iznad optimuma, a u 2 slučaja izvršila je manje naloga. Zato su dodani ruin & recreate i ejection potez. Nakon toga, na 40 instanci:
   - svugdje izvrši jednako naloga
   - u 38 slučajeva je optimalna, prosječno 0,28 % iznad optimuma

   Dodatni potez koji nije donio poboljšanje uklonjen je. Ograničenja heuristike navedena su u aplikaciji i dokumentaciji.
4. **Haversine udaljenost** provjerena je nezavisnim izračunom: 1° na ekvatoru = 111,195 km; Zagreb–Split 259,1 km, a uz faktor 1,3 336,8 km.
5. **Referencijalni integritet** kod brisanja provjerava test sa 300 nasumičnih koraka uređivanja.
6. **Validator je proširen.** Sada provjerava i vrijeme utovara/istovara po nalogu, pauzu i prikazana vremena. Testovi potvrđuju da otkriva izmijenjene (krivotvorene) planove.
7. **Vizualna provjera (headless).** Otkrila je i ispravljene su ove greške:
   - tablica lokacija prelijevala se preko susjedne kartice
   - oznake na liniji vremena preklapale su se
   - glavna KPI brojka lomila se u dva retka
8. **Logo** je preuzet s uprent.hr preko preglednika, a ispravnost datoteke potvrđena je CRC provjerom svih PNG blokova.

Završni detalji (mobilni prikaz, usporedba scenarija, ispis za vozača, uvoz/izvoz) provjereni su na isti način:

- **Usporedba scenarija:** test potvrđuje brojke 182,2 / 200,1 / 217,0 km i sadržaj generiranih objašnjenja.
- **Uvoz i izvoz:** testovi u oba smjera (JSON, CSV, link) te testovi grešaka s brojem retka.
- **Headless provjera cijelog toka:** preuzimanje, ponovni uvoz, izmjena CSV-a s 217,0 km kao rezultatom, otvaranje linka u novom prozoru.
- **Ispis:** pregledan kao generirani PDF.
- **Mobitel:** provjereno na širinama 360 i 390 px, bez horizontalnog prelijevanja.

Za cestovne rute, pretragu adresa i CSV predloške:

- **Javni servisi su prvo isprobani izravno iz preglednika.** OSRM daje Zagreb–Velika Gorica 20,1 km cestom. Nominatim za „Ilica 10” vraća kućni broj, a za „Horvatova ulica 13” samo ulicu, jer kućni broj nije u OpenStreetMap podacima. Zato aplikacija u tom slučaju jasno upozorava, umjesto da tiho stavi marker na ulicu.
- **Testovi:**
  - solver i validator koriste cestovnu matricu
  - kad servis ne radi, koristi se rezervni izračun i to se javlja
  - OSRM URL-ovi i greške
  - Google Maps linkovi, uključujući podjelu dugih ruta
  - CSV predlošci se uvoze bez greške
  - uvoz u oba smjera za vozila i lokacije (koordinatni sustav i dalje daje 200,1 km)

Ukupno je tada bilo **176 testova**, a svi su prolazili.

## Četvrta faza (21.11.2026.)

Zahtjevi: četiri jezika, strelice za zatvaranje i proširenje ulaznih podataka, jedan CSV predložak, nova vremenska linija, brojevi na osima karte, isključivanje iste lokacije u nalogu, brzina po relaciji, žuto označavanje naloga s upozorenjem te ravnomjerna raspodjela posla. Provjera:

1. **Ravnomjerna raspodjela.** Prvo je izmjeren čisti min-max: 284,2 km (+42 %), što je preskupo. Zato je cilj definiran s granicom km (zadano +10 %). Rezultat 217,0 km (A 122 min, B 495 min) odgovara primjeru iz zahtjeva i potvrđen je na tri načina:
   - nezavisna Python provjera potpunom pretragom svih podjela (`tools/reference_check.py`)
   - test usporedbe s brute force pretragom na nasumičnim instancama
   - validator: plan poštuje sva pravila
   
   Mjerenje je otkrilo i slabost prve verzije heuristike (s granicom +10 % nije našla ništa bolje od 200,1 km), pa je dodan drugi ruin & recreate s rangiranjem po najduljem danu.
2. **Brzina po relaciji.** OSRM je prvo pozvan izravno: Zagreb – Karlovac 55,1 km za 48 min (69 km/h). AI je u prvom nacrtu teksta pomoći napisao 56 km za 42 min; to je ispravljeno prema stvarnom odgovoru servisa, a isti odgovor je u testu. Test s ručno složenom matricom pokazuje slučaj kad najkraća ruta ne stane u dan, a najbrža stane, i da validator taj plan prihvaća.
3. **Prijevodi.** TypeScript ne dopušta da u nekom jeziku nedostaje tekst ili parametar. Test dodatno provjerava da nijedan prijevod nije kopija hrvatskog i da poruke solvera prate odabrani jezik. Svi postojeći testovi i dalje provjeravaju hrvatske tekstove.
4. **Jedan CSV.** Testovi: predložak, uvoz u oba smjera s rezultatom 200,1 km, datoteke spremljene na engleskom, francuskom i njemačkom, greške s brojem retka u datoteci.
5. **Vizualna provjera (headless Chrome, hrvatski, engleski i njemački, mobitel 390 px).** Otkrila je i ispravljene su ove greške:
   - prazan prostor iznad rezultata kad su ulazni podaci zatvoreni
   - njemački naziv kartice „Einstellungen” prelazio je rub izbornika
   - izbornik jezika na mobitelu prekrivao je naslov
   - KPI „Ravnomjerna raspodjela” se rezao

6. **Excel umjesto CSV-a (Antonijev zahtjev nakon pregleda):** jedan list po sekciji, oblikovan kao tablica. Provjereno testovima (listovi, tablice, padajuća lista, uvoz u oba smjera, greške), preuzimanjem i ponovnim učitavanjem u headless pregledniku (200,1 km) te otvaranjem datoteke u LibreOfficeu.
7. **Sigurnost:** sigurnosna zaglavlja (CSP i ostala) provjerena su u pregledniku s istim zaglavljima kao u produkciji, prije pusha: stranica, Excel i karta rade, a preglednik ne javlja nijednu blokadu. Ograničenja uvoza imaju testove, a `npm audit` je čist.
8. **Live provjera nakon deploya (Chrome):** podaci iz zadatka daju 200,1 km i prijedlog ravnomjerne raspodjele (217,0 km); primjer na stvarnoj karti daje brzine dionica 47–69 km/h, 505,6 km i „Sve OK”.

Ukupno je **210 testova**, a svi prolaze.

## Zaključak

AI je značajno ubrzao implementaciju. Kvaliteta rješenja ipak dolazi iz toga što je svaki rezultat **provjerljiv**: egzaktan algoritam, dvije neovisne implementacije, brute force, validator i testovi. Tako i greška AI-ja ne bi mogla proći neopaženo.
