# Optimizacijska logika

## Problem

Ovo je problem preuzimanja i isporuke s kapacitetima (*Capacitated Pickup and Delivery Problem*) za dva vozila, uz:

- nosivost u kg i najveći broj strojeva u kamionu istodobno
- preuzimanje prije isporuke, i to istim kamionom
- obavezan polazak iz baze i povratak u bazu
- dnevni limit radnog vremena vozača od 9 h (60 km/h, 20 min po utovaru ili istovaru)

Cilj: izvršiti što više naloga, a među takvim rasporedima odabrati onaj s najmanjom ukupnom kilometražom.

## Pretpostavke

1. **Dnevni limit od 9 h** po zadanoj postavci znači **ukupno radno vrijeme vozača**: vrijeme vožnje (km / 60 km/h) plus 20 min za svako preuzimanje i svaku isporuku. Zadatak se može čitati i kao "9 h same vožnje", pa aplikacija nudi prekidač s tri načina: *vožnja + utovar/istovar*, *samo vožnja* i *bez limita*.
2. **Udaljenost** je euklidska. Svaka dionica se zaokružuje na 0,1 km, a ukupna kilometraža je zbroj zaokruženih dionica. Interno se sve računa u cijelim desetinkama kilometra, pa nema grešaka zaokruživanja s pomičnim zarezom.
3. **Plan je jednodnevni.** Nalog koji se ne može izvršiti tog dana ne preskače se tiho, nego se prikazuje kao neraspoređen, s razlogom.
4. Utovar i istovar na istoj lokaciji broje se kao zasebne radnje, po 20 min svaka.
5. Dvije radnje na istoj lokaciji imaju dionicu od 0 km.

## Algoritam

Podataka je malo (10 naloga, 2 kamiona), pa umjesto heuristike koristimo **egzaktni algoritam** koji garantira optimum.

### 1. Najkraća ruta za svaki podskup naloga, po kamionu

Dinamičko programiranje nad stanjima:

```
stanje = (trenutna lokacija, status svakog naloga)
status ∈ { 0 = čeka preuzimanje, 1 = u kamionu, 2 = isporučen / nije u ovoj ruti }
```

Iz stanja su dopušteni ovi prijelazi:

- **preuzimanje** naloga sa statusom 0, ako ukupna težina i broj strojeva nakon utovara ostaju unutar granica kamiona
- **isporuka** naloga sa statusom 1
- **povratak u bazu** kad su svi nalozi u statusu 2

Vrijednost stanja je najkraća preostala udaljenost. Status 2 služi i kao "nije u ovom podskupu", pa jedna memoizirana tablica odjednom daje najkraću rutu za **svih 2¹⁰ = 1.024 podskupa** naloga. Prostor stanja je najviše 10 lokacija × 3¹⁰ ≈ 590.000.

Ograničenja nosivosti i broja strojeva provjeravaju se pri svakom prijelazu, pa nijedna ruta koju DP vrati ne može ih prekršiti. Isto vrijedi za redoslijed preuzimanja i isporuke.

Za svaki podskup se zatim provjerava dnevni limit. Broj radnji je fiksan (2 po nalogu), pa je najkraća ruta ujedno i najbrža. Podskupovi koji prelaze 9 h odbacuju se.

### 2. Raspodjela naloga na kamione

"Subset convolution" preko kamiona:

```
best_k[S] = min po T ⊆ S ( ruta_k[T] + best_(k-1)[S \ T] )
```

`best[S]` je najmanja ukupna kilometraža kojom kamioni izvršavaju točno skup naloga `S`. Za 10 naloga to je 3¹⁰ = 59.049 kombinacija po kamionu. Odabire se `S` s **najviše naloga**, a među njima onaj s **najmanje km**. Pristup radi za bilo koji broj kamiona.

### 3. Rekonstrukcija i provjera

Iz memo tablice se rekonstruira redoslijed radnji, s opterećenjem, kumulativnim km i vremenom nakon svakog koraka. Zatim **nezavisni validator** (`validatePlan.ts`) ponovno prolazi svaku rutu korak po korak, ne oslanjajući se na solver, i provjerava:

- dionice
- nosivost i broj strojeva
- preuzimanje prije isporuke istim kamionom
- polazak i povratak u bazu
- dnevni limit
- da je svaki nalog izvršen točno jednom ili prijavljen kao neizvršiv

Rezultat validatora vidi se u aplikaciji.

### Neizvršivi nalozi

Nalog ostaje neraspoređen samo ako nijedan valjani raspored ne može izvršiti više naloga. Razlog se određuje ovim redom:

1. stroj je teži od nosivosti svih kamiona
2. nalog ne stane u radni dan ni kad ga kamion vozi sam
3. svi nalozi zajedno ne stanu u radni dan voznog parka

### Složenost i ograničenja

- Za zadane podatke izračun traje **oko 30–50 ms** u pregledniku.
- Složenost raste kao O(L · 3ⁿ · n), pa je egzaktni solver ograničen na **12 naloga**. Aplikacija za više naloga javlja grešku umjesto da tiho vrati loš rezultat.
- Za veći broj naloga prirodni sljedeći korak je:
  - **OR-Tools** (CP-SAT ili Routing s pickup-delivery ograničenjima), ili
  - **heuristika** (insertion + local search / ALNS), s ovim egzaktnim solverom kao referencom za provjeru kvalitete na malim instancama

## Rezultati za podatke iz zadatka

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
