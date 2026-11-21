# Optimizacijska logika

> **Traženo vs. dodatno.** Sekcije 1–4 opisuju rješenje zadatka (podaci iz zadatka, egzaktni optimum). Sekcija 5 opisuje dodatne mogućnosti iz druge faze: pauzu, vrijeme utovara/istovara po nalogu, više vozila, heuristiku i stvarnu kartu. Uz zadane postavke rezultat za podatke iz zadatka je nepromijenjen: **200,1 km**.

## 1. Problem

Ovo je problem preuzimanja i isporuke s kapacitetima (*Capacitated Pickup and Delivery Problem*), uz:

- nosivost u kg i najveći broj strojeva u vozilu istodobno
- preuzimanje prije isporuke, i to istim vozilom
- obavezan polazak iz baze i povratak u bazu
- dnevni limit radnog vremena vozača od 9 h (60 km/h, 20 min po utovaru ili istovaru)

Cilj: izvršiti što više naloga, a među takvim rasporedima odabrati onaj s najmanjom ukupnom kilometražom.

## 2. Pretpostavke

1. **Dnevni limit od 9 h** po zadanoj postavci znači **ukupno radno vrijeme vozača**: vrijeme vožnje (km / 60 km/h) plus 20 min za svako preuzimanje i svaku isporuku. Zadatak se može čitati i kao "9 h same vožnje", pa aplikacija nudi prekidač s tri načina: *vožnja + utovar/istovar*, *samo vožnja* i *bez limita*.
2. **Udaljenost** je euklidska. Svaka dionica se zaokružuje na 0,1 km, a ukupna kilometraža je zbroj zaokruženih dionica. Interno se sve računa u cijelim desetinkama kilometra, pa nema grešaka zaokruživanja s pomičnim zarezom.
3. **Plan je jednodnevni.** Nalog koji se ne može izvršiti tog dana ne preskače se tiho, nego se prikazuje kao neraspoređen, s razlogom.
4. Utovar i istovar na istoj lokaciji broje se kao zasebne radnje, po 20 min svaka.
5. Dvije radnje na istoj lokaciji imaju dionicu od 0 km.

## 3. Algoritam (egzaktni)

Podataka je malo (10 naloga, 2 kamiona), pa umjesto heuristike koristimo **egzaktni algoritam** koji garantira optimum.

### 3.1 Najkraća ruta za svaki podskup naloga, po vozilu

Dinamičko programiranje nad stanjima:

```
stanje = (trenutna lokacija, status svakog naloga)
status ∈ { 0 = čeka preuzimanje, 1 = u vozilu, 2 = isporučen / nije u ovoj ruti }
```

Iz stanja su dopušteni ovi prijelazi:

- **preuzimanje** naloga sa statusom 0, ako ukupna težina i broj strojeva nakon utovara ostaju unutar granica vozila
- **isporuka** naloga sa statusom 1
- **povratak u bazu** kad su svi nalozi u statusu 2

Vrijednost stanja je najkraća preostala udaljenost. Status 2 služi i kao "nije u ovom podskupu", pa jedna memoizirana tablica odjednom daje najkraću rutu za **svih 2¹⁰ = 1.024 podskupa** naloga. Prostor stanja je najviše 10 lokacija × 3¹⁰ ≈ 590.000.

Ograničenja nosivosti i broja strojeva provjeravaju se pri svakom prijelazu, pa nijedna ruta koju DP vrati ne može ih prekršiti. Isto vrijedi za redoslijed preuzimanja i isporuke.

Za svaki podskup se zatim provjerava dnevni limit. Vrijeme utovara i istovara za zadani podskup je konstanta, pa je najkraća ruta ujedno i najbrža. Podskupovi koji prelaze 9 h odbacuju se.

### 3.2 Raspodjela naloga na vozila

"Subset convolution" preko vozila:

```
best_k[S] = min po T ⊆ S ( ruta_k[T] + best_(k-1)[S \ T] )
```

`best[S]` je najmanja ukupna kilometraža kojom vozila izvršavaju točno skup naloga `S`. Za 10 naloga to je 3¹⁰ = 59.049 kombinacija po vozilu, a za N vozila složenost je O(N · 3ⁿ). Odabire se `S` s **najviše naloga**, a među njima onaj s **najmanje km**.

### 3.3 Rekonstrukcija i provjera

Iz memo tablice se rekonstruira redoslijed radnji, s opterećenjem, kumulativnim km te vremenom dolaska i odlaska za svaki korak. Zatim **nezavisni validator** (`validatePlan.ts`) ponovno prolazi svaku rutu korak po korak, ne oslanjajući se na solver, i provjerava:

- dionice
- nosivost i broj strojeva
- preuzimanje prije isporuke istim vozilom
- polazak i povratak u bazu
- dnevni limit, uz utovar/istovar po nalogu i pauzu
- prikazana vremena
- da je svaki nalog izvršen točno jednom ili prijavljen kao neizvršiv

Rezultat validatora vidi se u aplikaciji.

### 3.4 Neizvršivi nalozi

Nalog ostaje neraspoređen samo ako nijedan valjani raspored ne može izvršiti više naloga. Razlog se određuje ovim redom:

1. stroj je teži od nosivosti svih vozila
2. nalog ne stane u radni dan ni kad ga vozilo vozi samo
3. svi nalozi zajedno ne stanu u radni dan voznog parka

## 4. Rezultati za podatke iz zadatka

### Vožnja + utovar/istovar ≤ 9 h (zadano) — **200,1 km**

| Kamion | Nalozi | Km | Vožnja | Utovar/istovar | Ukupno |
|---|---|---|---|---|---|
| A (3.500 kg, 2 stroja) | N03 | 37,2 | 0 h 37 min | 0 h 40 min | 1 h 17 min |
| B (10.000 kg, 3 stroja) | N01, N02, N04–N10 | 162,9 | 2 h 43 min | 6 h 00 min | 8 h 43 min |

- **Ruta A:** L0 → P N03 @L9 → D N03 @L4 → L0
- **Ruta B:** L0 → P N05 @L0 → P N01 @L1 → P N02 @L2 → D N05 @L8 → P N07 @L8 → D N07 @L2 → D N01 @L3 → D N02 @L5 → P N06 @L5 → D N06 @L7 → P N10 @L7 → D N10 @L3 → P N04 @L3 → P N08 @L4 → D N08 @L9 → P N09 @L6 → D N09 @L1 → D N04 @L0 → L0

(P = preuzimanje, D = isporuka)

### Bez limita ili samo vožnja — **182,2 km**

Kamion B sam vozi svih 10 naloga: 182,2 km, odnosno 3 h 02 min vožnje. Uz 20 radnji × 20 min to je ukupno **9 h 42 min**, što prelazi radni dan od 9 h. Zato je 200,1 km optimum uz realno tumačenje limita.

### Zapažanja o podacima

- Strojevi **M06–M10 (3.900–9.400 kg) stanu samo u kamion B**, pa kamion A može voziti samo N01–N05.
- **Uz M10 (9.400 kg) ne može ići nijedan drugi stroj**, jer je i s najlakšim M01 ukupno 10.200 kg.
- Kamion B mora odraditi najmanje 5 naloga (N06–N10), što je već 3 h 20 min samog utovara i istovara.

## 5. Dodatne mogućnosti (faza 2)

### 5.1 Obavezna pauza

- Prekidač je u postavkama, a trajanje je po defaultu 30 min. Pauza je **po defaultu isključena**, pa podaci iz zadatka i dalje daju 200,1 km.
- Pauza se dodaje **svakom vozilu koje ima barem jedan nalog**.
- U načinu *vožnja + utovar/istovar* pauza ulazi u limit. U načinu *samo vožnja* ne ulazi, pa taj način i s pauzom daje 182,2 km.
- Za zadani podskup naloga pauza je konstanta, pa DP ostaje egzaktan.
- U planu je pauza zaseban korak. Smještena je nakon prve radnje kod koje proteklo vrijeme dosegne polovicu radnog vremena rute, a na kilometražu ne utječe.

**Rezultat s pauzom od 30 min: 217,0 km.** Kamion A vozi N01 i N04 (41,7 km), a kamion B ostalih 8 naloga (175,3 km, 8 h 45 min). Isti rezultat daje i `tools/reference_check.py`.

### 5.2 Vrijeme utovara i istovara po nalogu

Svaki nalog može imati vlastito vrijeme utovara i istovara (`pickupMinutes`, `deliveryMinutes`). Ako vrijednost nije zadana, vrijedi globalnih 20 min. Vrijeme podskupa je zbroj minuta njegovih naloga, a to je i dalje konstanta za podskup, pa najkraća ruta ostaje najbrža i DP ostaje egzaktan.

Primjer: ako utovar N09 traje 60 min umjesto 20, optimum se mijenja na 217,0 km (A: N01 + N04). Rezultat je provjeren Python referencom.

### 5.3 Više vozila i odabir solvera

Subset convolution radi za N vozila. Pri tome:

- DP koristi samo lokacije koje nalozi stvarno koriste (najviše 2n + 1)
- memo tablica je `Float32` i oslobađa se nakon izračuna, a izbori ostaju u `Int8` polju

Tako 12 naloga i 4 vozila stanu u memoriju preglednika i rješavaju se za oko 0,4 s.

Postavka **Solver** ima tri opcije:

| Opcija | Ponašanje |
|---|---|
| **Automatski** (default) | ≤ 12 naloga: egzaktni solver, > 12 naloga: heuristika |
| Egzaktni | uvijek egzaktni solver; za > 12 naloga javlja grešku umjesto da dugo računa |
| Heuristika | uvijek heuristika |

Rezultat uvijek prikazuje koji je solver korišten.

### 5.4 Heuristika (`src/solver/heuristic.ts`)

1. **Konstrukcija umetanjem.** Par preuzimanje/isporuka umeće se na mjesto gdje dodaje najmanje km. Provjeravaju se nosivost, broj strojeva, redoslijed i dnevni limit (uključujući minute po nalogu i pauzu). Pokreće se 6 početaka: regret-2, "najdulji nalozi prvi" i 4 nasumična redoslijeda s fiksnim seedom.
2. **Lokalna pretraga** do lokalnog optimuma, s ovim potezima:
   - umetanje neraspoređenih naloga
   - *ejection*: premještanje jednog naloga kako bi se oslobodilo mjesto za neraspoređeni
   - *relocate*: nalog se vadi i umeće na najbolje mjesto, u istom ili drugom vozilu
   - *swap*: zamjena naloga između dvaju vozila
3. **Ruin & recreate** do 1.500 iteracija ili 1,5 s:
   - uklanja se 15–40 % naloga, srodnih ili nasumičnih
   - nalozi se vraćaju regret-2 umetanjem
   - rezultat se dorađuje lokalnom pretragom
   - prihvaćanje je kao kod *simulated annealinga*; nikad se ne prihvaća rješenje s manje naloga

Cilj je isti kao kod egzaktnog solvera: najviše naloga, zatim najmanje km. Seed je fiksan, pa je rezultat ponovljiv.

**Izmjerena kvaliteta** (egzaktni solver kao referenca):

| Skup | Rezultat |
|---|---|
| 40 nasumičnih instanci s 9 naloga | svugdje jednako izvršenih naloga; 38/40 optimalno; prosječno +0,28 %, najgore +9,7 % km |
| Podaci iz zadatka (limit 9 h) | 200,1 km, optimalno |
| Podaci iz zadatka + pauza | 217,0 km, optimalno |
| Podaci iz zadatka bez limita | 183,6 km (optimum 182,2; +0,8 %) |
| 50 naloga, 5 vozila | valjan plan za oko 1,5 s |

Heuristika **nema jamstvo optimuma**, i to aplikacija jasno navodi. Zato *Automatski* način za ≤ 12 naloga uvijek bira egzaktni solver. Za veće probleme sljedeći korak bio bi OR-Tools (Routing s pickup-delivery ograničenjima) ili CP-SAT na backendu, s ovim egzaktnim solverom kao referencom na malim instancama.

### 5.5 Stvarna karta i udaljenosti

Skup podataka je u jednom od dva načina, bez miješanja:

- **koordinatni sustav** iz zadatka (km), s euklidskom udaljenosti
- **stvarna karta** (geografska širina i dužina), s jednim od dva izvora udaljenosti (postavka *Udaljenosti na stvarnoj karti*):
  - **po cestama (OSRM), zadano:** prije optimizacije aplikacija dohvaća matricu stvarnih udaljenosti vožnje između svih lokacija (OSRM table servis, OpenStreetMap cestovna mreža). Solver i validator koriste tu matricu, svaka dionica se zaokružuje na 0,1 km, a karta crta rute po cestama.
  - **zračna × faktor:** haversine (R = 6371,0088 km) × faktor ceste (zadano 1,3). Radi bez interneta i služi kao **rezerva**: ako servis za rute nije dostupan, aplikacija automatski koristi ovaj izračun i to javlja iznad rezultata.

Solver se ne mijenja: radi nad matricom udaljenosti, bez obzira na njezin izvor. Vrijeme vožnje opisano je u 5.8: u koordinatnom sustavu iz zadatka to je km / 60 km/h, a na stvarnoj karti po cestama vrijeme svake relacije iz OSRM-a.

Javni OSRM server namijenjen je laganom korištenju, pa se rezultati spremaju u cache. U produkciji bi to bio vlastiti OSRM ili komercijalni API (Google, HERE, Mapbox), s istim sučeljem prema solveru.

**Unos lokacija:**
- klik na kartu
- pretraga adrese (Nominatim, najviše 1 upit u sekundi), s kvartom, gradom i poštanskim brojem
- lijepljenje koordinata ili linka iz Google karata
- povlačenje markera
- ručni unos koordinata
- uvoz Excela (ili CSV-a) s adresama, koje se onda geokodiraju jedna po jedna

Kućni brojevi postoje samo tamo gdje su upisani u OpenStreetMap. Kad broja nema, rezultat je ulica, uz napomenu da se marker povuče na točno mjesto.

**„Otvori u Google kartama”** gradi Google Maps URL za navigaciju s redoslijedom stanica vozila. Takav URL prima najviše 9 međutočaka, pa se dulje rute dijele na nastavke (kraj jednog dijela je početak sljedećeg).

### 5.6 Usporedba scenarija

`src/solver/scenarios.ts` rješava iste podatke tri puta: bez limita, uz limit radnog dana i uz limit s pauzom. Svaki plan zasebno provjerava validator. Objašnjenja se ne pišu ručno, nego se generiraju iz planova:

- koji su nalozi prešli na koje vozilo
- razlika u km u odnosu na prethodni scenarij
- vozilo koje bi bez limita prekoračilo radni dan

Za podatke iz zadatka:

| Scenarij | Km | Razlika | Zašto |
|---|---|---|---|
| Bez limita | 182,2 | – | Kamion B vozi svih 10 naloga, ali bi radio 9 h 42 min |
| Limit 9 h | 200,1 | +17,9 km | N03 prelazi na kamion A |
| Limit 9 h + pauza 30 min | 217,0 | +16,9 km | N01 i N04 prelaze na kamion A, a N03 se vraća na B |

### 5.7 Ravnomjerna raspodjela (cilj optimizacije)

Postavka *Cilj optimizacije* ima dvije vrijednosti:

- **Najmanje km** (zadano, kao u zadatku): najviše izvršenih naloga, zatim najmanje ukupnih km.
- **Ravnomjerna raspodjela:** najviše izvršenih naloga, zatim **što kraći najduži radni dan** (min-max), uz najviše **+X % km** u odnosu na plan s najmanje km (zadano X = 10). Među planovima s tim najkraćim najduljim danom bira se onaj s najmanje km.

Bez granice km čisti min-max za podatke iz zadatka daje 284,2 km (+42 %), uz 339 i 345 min rada. To je skupo, pa je granica dio cilja, a ne naknadna provjera.

**Egzaktni algoritam:**

1. DP iz 3.1 daje najkraću rutu i njezino radno vrijeme za svaki (vozilo, podskup naloga).
2. Konvolucija iz 3.2 daje najmanje km K* i najveći broj izvršenih naloga.
3. Moguće duljine najduljeg dana su konačan skup: radna vremena svih (vozilo, podskup). Binarnom pretragom po tom skupu traži se najmanja vrijednost T za koju konvolucija, ograničena na podskupove s radnim vremenom ≤ T, daje isti broj naloga i km ≤ K* × (1 + X/100). Svojstvo je monotono (veći T, veći izbor), pa je pretraga ispravna.
4. Plan je konvolucija s najmanje km uz taj T.

Za podatke iz zadatka (X = 10 %): **217,0 km (+16,9 km)**, kamion A vozi N01 i N04 (122 min), kamion B ostalih osam naloga (495 min). Isti rezultat daje nezavisna Python provjera (`tools/reference_check.py`, potpuna pretraga svih podjela) i test koji rezultat uspoređuje s brute force pretragom na nasumičnim instancama.

**Heuristika** (više od 12 naloga): nakon optimizacije po km slijedi drugi ruin & recreate koji planove rangira po najduljem danu (pa km) i odbacuje one iznad granice km, te završna faza premještanja i zamjene naloga s najopterećenijeg vozila.

**Prijedlog u rezultatu:** kad je cilj *Najmanje km*, a neko vozilo radi manje od polovice najduljeg dana, aplikacija izračuna i ravnomjernu varijantu. Ako ona stvarno skraćuje najdulji dan, prikaže prijedlog („Kamion A je slabo iskorišten (77 min)…”) s gumbom za primjenu.

### 5.8 Brzina po relaciji

Jedna prosječna brzina ne opisuje stvarnost: autocesta je brža od gradske dionice. Zato na **stvarnoj karti s udaljenostima po cestama** vrijeme vožnje dolazi iz OSRM-a za svaku relaciju (postavka *Vrijeme vožnje: Po relaciji (OSRM)*, zadano):

- vrijeme dionice = max(OSRM vrijeme, km / najveća brzina kamiona)
- OSRM računa za osobni automobil, pa je brzina kamiona na relaciji ograničena na **80 km/h** (u HR ograničenje za kamione na autocesti; podesivo)
- vremena se zaokružuju na cijele sekunde, pa solver, plan i validator rade s istim brojevima
- brzina dionice (km / vrijeme) prikazana je u tablici rute i u oblačiću na vremenskoj liniji

Primjer (OSRM, 21.11.2026.): Zagreb – Karlovac, centar – centar, 55,1 km za 48 min ≈ **69 km/h**.

Provjereno live (21.11.2026., primjer „okolica Zagreba”): brzine dionica od 47 do 69 km/h, ukupno 505,6 km, 10/10 naloga, „Sve OK”. Uz prosječnih 60 km/h isti primjer daje 453,4 km: stvarna vremena su sporija, pa limit od 9 h tjera na drukčiju, dulju raspodjelu. Za dio podskupova korištena je najbrža ruta, i aplikacija to javlja.

U **koordinatnom sustavu iz zadatka** nema cesta, pa se i dalje koristi prosječna brzina (60 km/h). Zato podaci iz zadatka i dalje daju 182,2 / 200,1 / 217,0 km. Ista prosječna brzina ostaje i kao rezerva ako OSRM ne vrati vremena, a može se odabrati i ručno (*Prosječna brzina*).

**Utjecaj na egzaktnost.** S prosječnom brzinom vrijeme je proporcionalno km, pa je najkraća ruta podskupa ujedno i najbrža i DP ostaje egzaktan. S vremenom po relaciji to više ne vrijedi: dulja ruta može biti brža. Solver to rješava ovako:

1. Za svaki podskup najprije provjerava najkraću rutu.
2. Ako ona prelazi dnevni limit, drugi DP (isti, ali s vremenom kao težinom) daje najbržu rutu. Ako najbrža stane u dan, koristi se ona.
3. Takvi slučajevi broje se u planu (`timeFallbacks`), a rezultat tada javlja da optimum po km nije dokazan. Plan je i dalje valjan prema validatoru.

Za podskupove kod kojih najkraća ruta stane u dan rezultat ostaje dokazivo optimalan.

