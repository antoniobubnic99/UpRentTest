# UP RENT – Smart Logistics Planner

Prototip web-aplikacije koja raspoređuje transportne naloge radnih strojeva na vozila Up Renta i za svako vozilo određuje optimalan redoslijed preuzimanja i isporuka, uz najmanju ukupnu kilometražu.

**Live demo:** https://uprenttest.vercel.app/

![Rezultat optimizacije](docs/screenshots/02-rezultat.png)

## Rezultat za podatke iz zadatka

| Tumačenje limita od 9 h | Raspored | Ukupno |
|---|---|---|
| **Vožnja + utovar/istovar** (zadana pretpostavka) | Kamion A: N03 (37,2 km, 1 h 17 min) · Kamion B: ostalih 9 naloga (162,9 km, 8 h 43 min) | **200,1 km** |
| Samo vožnja / bez limita | Kamion B: svih 10 naloga (182,2 km, ali 9 h 42 min ukupnog rada) | 182,2 km |
| Vožnja + utovar/istovar + obavezna pauza od 30 min (dodatna opcija, po defaultu isključena) | Kamion A: N01, N04 (41,7 km) · Kamion B: ostalih 8 naloga (175,3 km, 8 h 45 min) | 217,0 km |

Za podatke iz zadatka rješenje je **dokazivo optimalno**: koristi se egzaktni solver. Rezultati su nezavisno potvrđeni Python implementacijom i usporedbom s brute force pretragom. Detalji su u [docs/OPTIMIZACIJA.md](docs/OPTIMIZACIJA.md).

## Pokretanje

Potrebno: [Node.js](https://nodejs.org/) 20 ili noviji.

```bash
npm install      # instalacija ovisnosti
npm run dev      # razvojni server na http://localhost:5173
npm test         # testovi (Vitest)
npm run build    # produkcijski build u dist/
```

Nezavisna provjera rezultata u Pythonu (bez ovisnosti):

```bash
python3 tools/reference_check.py
```

Aplikacija se otvara prazna. Gumb **„Vrati podatke iz zadatka”** učitava 2 kamiona, 10 lokacija i 10 naloga iz zadatka, a zatim **„Optimiziraj raspored”** računa plan.

## Funkcionalnosti

### Traženo zadatkom

- **Prikaz i uređivanje ulaznih podataka:** vozni park, lokacije, strojevi i transportni nalozi.
- **Automatska raspodjela naloga** na vozila i **redoslijed obilaska** za svako vozilo.
- **Poštivanje svih ograničenja:**
  - nosivost (kg) i broj strojeva u svakom trenutku
  - preuzimanje prije isporuke, i to istim vozilom
  - polazak i povratak u bazu
  - dnevni limit od 9 h, uz prekidač za tumačenje: *vožnja + utovar/istovar* / *samo vožnja* / *bez limita*
- **Rezultat po vozilu:**
  - redoslijed lokacija i radnje (preuzimanje / isporuka)
  - opterećenje nakon svake radnje (kg i broj strojeva)
  - dionica i kumulativni km, vrijeme dolaska i odlaska
  - ukupna kilometraža i broj izvršenih naloga
- **Ukupna kilometraža** cijelog voznog parka i **karta ruta** (koordinatni sustav s brojevima na osima i mrežom od 1 km).
- **Jasna upozorenja** za naloge koje nije moguće izvršiti, s razlogom. Na primjer: stroj je teži od nosivosti svih vozila ili nalog ne stane u radni dan.
- **Nezavisni validator:** nakon svake optimizacije ponovno provjerava sva pravila i prikazuje „Provjera ograničenja: Sve OK”.

### Dodatno (iznad zadatka)

- **Proizvoljan broj vozila, lokacija i naloga**, s dodavanjem i brisanjem (×) te gumbom „Obriši sve”. Pri brisanju se čuva referencijalni integritet: lokacija koju koriste nalozi briše se tek nakon potvrde, a baza se ne može obrisati dok postoje nalozi.
- **Vrijeme utovara/istovara po nalogu** (veći teret može trajati duže). Ako polje ostane prazno, vrijedi zadanih 20 min.
- **Obavezna pauza (gablec)** kao opcija u postavkama: prekidač i trajanje, po defaultu isključena.
- **Solver: Automatski / Egzaktni / Heuristika.** Do 12 naloga radi egzaktni solver, a iznad toga se automatski uključuje heuristika (testirano do 50 naloga i 5 vozila). UI uvijek prikazuje koji je solver korišten.
- **Vremenska linija** po vozilu: radni dan kao traka od blokova (vožnja s km, utovar i istovar s oznakom lokacije, pauza) na osi sa satima (početak u 07:00) i crvenom crtom dnevnog limita. Uz vozilo piše ukupno vrijeme i postotak dana. Klik na blok označava korak u tablici.
- **Cilj optimizacije: Najmanje km / Ravnomjerna raspodjela.** Ravnomjerna raspodjela traži što kraći najduži radni dan, uz najviše +X % km u odnosu na najkraći plan (zadano 10 %), pa najmanje km. I dalje je egzaktna. Za podatke iz zadatka: kamion A vozi N01 i N04, ukupno 217,0 km (+16,9 km), A radi 122 min, B 495 min. Kad je jedno vozilo slabo iskorišteno, rezultat to sam predlaže, s gumbom „Primijeni ravnomjernu raspodjelu”.
- **Brzina po relaciji:** na stvarnoj karti vrijeme vožnje svake dionice dolazi iz servisa za rute (npr. Zagreb – Karlovac 55,1 km za 48 min ≈ 69 km/h), a ne iz jedne prosječne brzine. Kamion na relaciji ne ide brže od 80 km/h (podesivo). Brzina svake dionice prikazana je u tablici rute.
- **Četiri jezika:** hrvatski, engleski, francuski i njemački (izbornik u headeru, pamti se odabir). Prevedeni su i poruke solvera, upozorenja, CSV predložak i ispis za vozača.
- **Ulazni podaci:** strelica na rubu zatvara ulazne podatke i širi rezultat, a druga ih širi preko cijelog ekrana za lakši unos (nalozi tada u više stupaca).
- **Nalozi:** lokacija odabrana za preuzimanje ne nudi se za isporuku i obrnuto. Nalog s upozorenjem u rezultatu označen je žuto i u unosu, s razlogom ispod naloga; „Prikaži u unosu” vodi ravno na njega.
- **Prava karta** (Leaflet + OpenStreetMap) s **rutama po cestama** (OSRM). Na stvarnoj karti optimizacija koristi **stvarne cestovne udaljenosti**. Ako servis nije dostupan, koristi se zračna udaljenost × faktor ceste (1,3) i aplikacija to javlja.
- **Unos stvarnih lokacija:**
  - klik na kartu
  - pretraga adrese (Nominatim), s kvartom, gradom i poštanskim brojem
  - lijepljenje koordinata ili linka iz Google karata
  - povlačenje markera
  - ručni unos koordinata

  Kućni brojevi postoje samo gdje su upisani u OpenStreetMap. Kad broja nema, aplikacija to kaže i stavi marker na ulicu. Postoji i primjer s mjestima u okolici Zagreba.
- **„Otvori u Google kartama”** za svako vozilo: ruta s redoslijedom stanica, za navigaciju na mobitelu. Duge rute dijele se na dijelove, jer Google prima najviše 9 međutočaka.
- **Filter vozila** za liniju vremena, kartu i detalje: jedno, više ili sva vozila.
- **Raspored ekrana:** ulazni podaci i ograničenja su u lijevom izborniku iza hamburgera, a rezultati desno. Na mobitelu se izbornik otvara preko sadržaja.
- **Usporedba scenarija:** isti podaci u tri tumačenja radnog dana jedan pored drugog: bez limita 182,2 km, limit 9 h 200,1 km, limit uz pauzu 217,0 km. Objašnjenje je generirano iz samih planova: koji nalozi prelaze na koje vozilo, koliko km „košta” ograničenje i zašto najkraći plan nije izvediv. Svaki scenarij se može primijeniti jednim klikom.
- **Ispis plana za vozača:** jedna A4 stranica po vozilu, s redoslijedom, satnicom (početak u 07:00), lokacijama, radnjama, strojevima, teretom, stupcem za kvačicu i mjestom za potpis. U pregledniku se sprema kao PDF ([primjer](docs/primjer-plan-voznje.pdf)).
- **Uvoz i izvoz preko Excela (.xlsx):** jedna datoteka, **jedan list po sekciji** (Vozila, Lokacije, Nalozi):
  - svaki list je **Excel tablica** (crno-žuto zaglavlje, filteri, zamrznut prvi red, širine stupaca, format brojeva)
  - preuzimanje i isporuka biraju se s **padajuće liste lokacija**, a Excel odmah provjerava brojeve (nosivost, težina, minute)
  - **predložak za preuzimanje**: upišeš podatke i učitaš datoteku
  - list kojeg nema ostaje nepromijenjen; nazivi listova i stupaca prihvaćaju se na sva četiri jezika
  - lokacije mogu imati samo adresu, a koordinate se traže automatski
  - uvoz se provjerava i javlja greške s nazivom lista i brojem retka
  - i dalje se učitava i CSV sa sekcijama `#VOZILA`, `#LOKACIJE`, `#NALOZI`
  - biblioteka `exceljs` učitava se tek kad se Excel koristi, pa ne usporava otvaranje stranice
- **Cijeli skup kao JSON** i **link za dijeljenje** koji sadrži podatke u samom URL-u (komprimirano, ništa se ne šalje na server).
- **Prilagođeno mobitelu:** koraci rute kao kartice, vremenska linija preko cijele širine i polja bez zumiranja na iPhoneu.
- **Izgled u stilu uprent.hr** (logo, boje, header), uz napomenu da je riječ o prototipu, a ne službenom proizvodu.

## Screenshotovi

| | |
|---|---|
| [Početni (prazni) ekran](docs/screenshots/00-pocetni-ekran.png) | [Cijela stranica s rezultatom](docs/screenshots/01-cijela-aplikacija.png) |
| [Upozorenje: pretežak stroj](docs/screenshots/03-upozorenje-pretezak-stroj.png) | [Pauza i linija vremena (217,0 km)](docs/screenshots/04-pauza-i-linija-vremena.png) |
| [Utovar po nalogu (N09: 60 min)](docs/screenshots/05-nalozi-utovar-po-nalogu.png) | [Mobitel: rezultat](docs/screenshots/06-mobitel-rezultat.png) · [izbornik](docs/screenshots/07-mobitel-izbornik.png) |
| [Stvarna karta: primjer okolice Zagreba](docs/screenshots/08-stvarna-karta.png) | [Pretraga adrese (Nominatim)](docs/screenshots/09-pretraga-adrese.png) |
| [Usporedba scenarija](docs/screenshots/10-usporedba-scenarija.png) | [Primjer plana vožnje (PDF)](docs/primjer-plan-voznje.pdf) |
| [Prijedlog ravnomjerne raspodjele](docs/screenshots/11-prijedlog-ravnomjerne-raspodjele.png) | [Vremenska linija (ravnomjerna raspodjela)](docs/screenshots/12-vremenska-linija-ravnomjerno.png) |
| [Karta s brojevima na osima](docs/screenshots/13-karta-s-brojevima-na-osima.png) | [Unos preko cijelog ekrana, nalozi s upozorenjem](docs/screenshots/14-cijeli-ekran-nalozi-s-upozorenjem.png) |
| [Engleski jezik](docs/screenshots/15-engleski.png) | |

## Struktura

```
src/
  solver/                    # čista TypeScript logika, bez Reacta
    solver.ts                # egzaktni solver (DP + raspodjela) i odabir solvera
    heuristic.ts             # heuristika za > 12 naloga
    prepare.ts               # zajednička priprema podataka i izgradnja plana s vremenima
    time.ts                  # radno vrijeme rute (vožnja, utovar/istovar, pauza)
    validatePlan.ts          # nezavisna provjera poslovnih pravila
    validateInput.ts         # provjera ulaznih podataka
    scenarios.ts             # usporedba scenarija s objašnjenjima, prijedlog ravnomjerne raspodjele
    distance.ts              # euklidska / haversine udaljenost, zaokružena na 0,1 km
    types.ts
    *.test.ts                # testovi
  data/
    defaultData.ts           # podaci iz zadatka, prazno stanje, primjer za kartu
    edit.ts                  # dodavanje/brisanje uz referencijalni integritet
    geocode.ts               # pretraga adresa (Nominatim, najviše 1 upit/s)
    io.ts                    # JSON / CSV uvoz i izvoz, predlošci, link za dijeljenje
    xlsx.ts                  # Excel: list po sekciji, tablice, padajuće liste (exceljs, lazy)
    routing.ts               # cestovne udaljenosti i rute (OSRM)
    googleMaps.ts            # linkovi „Otvori u Google kartama”
  i18n/                      # prijevodi: hr (izvor), en, fr, de; TypeScript provjerava potpunost
  components/                # React UI (drawer, vremenska linija, karte, rezultati)
tools/reference_check.py     # nezavisna Python provjera
docs/                        # dokumentacija za predaju
```

## Testovi

`npm test` pokreće **208 test caseova** u 12 datoteka.

### Poslovna ograničenja iz zadatka (`src/solver/solver.test.ts`)

| # | Poslovno pravilo | Što se provjerava |
|---|---|---|
| 1 | Nosivost i broj strojeva | U nijednom koraku nijedno vozilo ne premašuje kg ni broj strojeva (sva 3 načina limita) |
| 2 | Preuzimanje prije isporuke, isto vozilo | Svaki stroj je preuzet prije isporuke, isto vozilo radi oboje, a svaki nalog je izvršen točno jednom ili prijavljen kao neizvršiv |
| 3 | Baza | Svaka ruta kreće iz baze i vraća se u nju, prazna |
| 4 | Dnevni limit od 9 h | Zadani podaci daju 200,1 km i oba kamiona su unutar 9 h. Bez limita je 182,2 km. Uz limit od 2 h nalozi se prijavljuju kao neizvršivi, s razlogom |
| 5 | Neizvršivi nalozi | Stroj od 12.000 kg prijavljen je upozorenjem, a ostali nalozi su svejedno optimizirani. Neispravan unos daje jasnu grešku |
| 6 | Optimalnost | Na 25 nasumičnih instanci solver daje isti rezultat kao naivni brute force |
| 7 | Udaljenost | Euklidska, zaokružena na 0,1 km po dionici |

### Dodatne funkcionalnosti

| Datoteka | Što se provjerava |
|---|---|
| `src/solver/time-and-heuristic.test.ts` | Pauza (217,0 km), utovar/istovar po nalogu, vremena dolaska i odlaska, 3+ vozila (egzaktni = brute force), automatski odabir solvera, kvaliteta heuristike u odnosu na egzaktni solver (30 instanci), 50 naloga i 5 vozila |
| `src/solver/model.test.ts` | Model podataka, haversine udaljenost, prazan ulaz, validacija novih polja |
| `src/data/edit.test.ts` | Dodavanje i brisanje uz referencijalni integritet (uključujući 300 nasumičnih koraka), „Obriši sve”, način stvarne karte |
| `src/data/geocode.test.ts` | Pretraga adresa: najviše 1 upit u sekundi, obrada rezultata i grešaka |
| `src/solver/scenarios.test.ts` | Usporedba scenarija: 182,2 / 200,1 / 217,0 km i generirana objašnjenja (npr. „Kamion B bi radio 9 h 42 min”) |
| `src/data/io.test.ts` | JSON i CSV u oba smjera, Excel format (BOM, zarez, navodnici), greške s brojem retka, link za dijeljenje |
| `src/solver/speed-and-balance.test.ts` | Ravnomjerna raspodjela: 217,0 km (A 122 min, B 495 min), 0 % = 200,1 km, bez granice 284,2 km, usporedba s brute force pretragom, heuristika unutar granice km; brzina po relaciji: OSRM vrijeme, ograničenje brzine kamiona, najbrža ruta kad najkraća ne stane u dan, Zagreb – Karlovac 69 km/h; prijedlog „slabo iskorišten” |
| `src/data/xlsx.test.ts` | Excel: listovi Vozila / Lokacije / Nalozi, svaki kao tablica, padajuća lista lokacija, uvoz predloška, oba smjera (200,1 km), listovi na EN/FR/DE, greške s nazivom lista i retkom |
| `src/data/csv-all.test.ts` | Jedan CSV s tri sekcije: predložak, uvoz u oba smjera (200,1 km), datoteke na EN/FR/DE, sekcija koje nema, greške s brojem retka |
| `src/i18n/i18n.test.ts` | Svi jezici imaju sve tekstove i parametre, prijevodi nisu kopije hrvatskog, poruke solvera prate odabrani jezik |
| `src/data/roads-and-csv.test.ts` | Cestovne udaljenosti u solveru i validatoru, rezervna zračna udaljenost, OSRM pozivi i greške, koordinate i Google Maps linkovi, oznaka kad kućni broj nije u OSM-u, CSV predlošci i uvoz vozila i lokacija |

## Dokumentacija za predaju

- [Opis optimizacijske logike i pretpostavki](docs/OPTIMIZACIJA.md)
- [Osvrt na korištene AI alate i način provjere](docs/AI-OSVRT.md)
- [Utrošeno vrijeme](docs/VRIJEME.md)

## Napomena

Ovo je prototip izrađen u sklopu selekcijskog zadatka i nije službeni proizvod Up Rent d.o.o. Karta: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Pretraga adresa: [Nominatim](https://nominatim.org/), uz poštivanje [pravila korištenja](https://operations.osmfoundation.org/policies/nominatim/). Cestovne rute: [OSRM](https://project-osrm.org/) (javni demo server; za produkciju vlastiti OSRM ili komercijalni API).
