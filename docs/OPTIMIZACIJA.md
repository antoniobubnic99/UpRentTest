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
- **stvarna karta** (geografska širina i dužina), s udaljenosti **haversine × faktor ceste**:
  - R = 6371,0088 km
  - faktor je po defaultu 1,3 i može se podesiti
  - zaokružuje se na 0,1 km po dionici, kao i u XY načinu

Faktor ceste je gruba, ali transparentna aproksimacija stvarne cestovne udaljenosti. Ne ovisi o vanjskom servisu, pa radi i offline i ponovljiva je. Prirodni sljedeći korak su stvarne cestovne udaljenosti iz OSRM-a ili Google Distance Matrix API-ja (matrica udaljenosti umjesto formule). Solver se pri tome ne mijenja, jer radi nad matricom udaljenosti.

Lokacije se unose klikom na kartu, pretragom adrese (Nominatim, najviše 1 upit u sekundi), povlačenjem markera ili ručnim upisom koordinata. Ručni unos uvijek radi, i kad javni servisi nisu dostupni.

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
