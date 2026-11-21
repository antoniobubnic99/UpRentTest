# Utrošeno vrijeme

Predviđeno trajanje zadatka: **6 h**.

## Faza 1: rješenje zadatka

| Datum | Od–do | Trajanje | Aktivnost |
|---|---|---|---|
| 20.11.2026. | 15:50–16:05 | 0 h 15 min | Čitanje zadatka, analiza ograničenja, Python izračun optimuma, plan, kreiranje repozitorija |
| 20.11.2026. | 16:05–16:10 | 0 h 05 min | Postavljanje projekta (Vite, React, TypeScript, Vitest), solver, validator, testovi |
| 20.11.2026. | 16:10–16:16 | 0 h 06 min | Analiza Up Rent vizualnog stila, UI, karta ruta, vizualna provjera i ispravci |
| 20.11.2026. | 16:16–16:25 | 0 h 09 min | Dokumentacija, Python referentna skripta u repou, deploy |
| 20.11.2026. | 16:45–16:47 | 0 h 02 min | Preformulacija dijela "Moja uloga" u AI osvrtu |
| | | **0 h 37 min** | |

## Faza 2: dorade (iznad zadatka)

| Datum | Od–do | Trajanje | Aktivnost |
|---|---|---|---|
| 20.11.2026. | 16:48–17:23 | 0 h 35 min | Moj pregled aplikacije i definiranje 10 zahtjeva za dorade |
| 20.11.2026. | 17:23–17:31 | 0 h 08 min | Plan faze 2, izračun utjecaja pauze (217,0 km), odluke o otvorenim pitanjima |
| 20.11.2026. | 17:31–17:34 | 0 h 03 min | Model podataka (stvarne koordinate, vrijeme po nalogu, nove postavke), prazan početni ekran |
| 20.11.2026. | 17:34–17:39 | 0 h 05 min | Dodavanje i brisanje vozila, lokacija i naloga, uz referencijalni integritet |
| 20.11.2026. | 17:39–17:49 | 0 h 10 min | Pauza, utovar/istovar po nalogu, više vozila, heuristika s mjerenjem kvalitete, odabir solvera |
| 20.11.2026. | 17:50–18:21 | 0 h 31 min | Novi raspored ekrana, linija vremena, prava karta i filter vozila, unos stvarnih lokacija, logo i stil Up Renta |
| 20.11.2026. | 18:21–18:25 | 0 h 04 min | Dokumentacija, screenshotovi, završna provjera |
| 20.11.2026. | 18:28–18:41 | 0 h 13 min | Push, deploy i provjera na live stranici (karta, pretraga adresa), screenshotovi karte |
| | | **1 h 49 min** | |

## Faza 3: završni detalji

| Datum | Od–do | Trajanje | Aktivnost |
|---|---|---|---|
| 20.11.2026. | 18:43–18:46 | 0 h 03 min | Prilagodba za mobitel (kartice koraka, linija vremena, KPI, polja bez zumiranja) |
| 20.11.2026. | 18:46–18:48 | 0 h 02 min | Usporedba scenarija s objašnjenjima |
| 20.11.2026. | 18:48–18:50 | 0 h 02 min | Ispis plana za vozača (A4 / PDF) |
| 20.11.2026. | 18:50–18:53 | 0 h 03 min | Uvoz i izvoz (JSON, CSV), link za dijeljenje, testovi, dokumentacija |
| 20.11.2026. | 20:57–21:02 | 0 h 05 min | Push, deploy i provjera na live stranici |
| 20.11.2026. | 21:09–21:17 | 0 h 08 min | Rute po cestama (OSRM), bolja pretraga adresa, „Otvori u Google kartama”, CSV predlošci i uvoz vozila i lokacija |
| | | **0 h 23 min** | |

## Faza 4: dorade nakon pregleda

| Datum | Od–do | Trajanje | Aktivnost |
|---|---|---|---|
| 21.11.2026. | 07:41–07:55 | 0 h 14 min | Brzina po relaciji (OSRM) i ravnomjerna raspodjela u solveru, s testovima i Python provjerom |
| 21.11.2026. | 07:55–08:10 | 0 h 15 min | Jedan CSV predložak, strelice i prikaz preko cijelog ekrana, nalozi (ista lokacija, žuto označavanje), vremenska linija, brojevi na osima, prijevodi na EN, FR i DE |
| 21.11.2026. | 08:10–08:20 | 0 h 10 min | Vizualna provjera na tri jezika i na mobitelu, ispravci, dokumentacija |
| 21.11.2026. | 08:17–08:22 | 0 h 05 min | Push, Vercel deploy, live provjera (brzina po relaciji 47–69 km/h) |
| 21.11.2026. | 08:25–08:40 | 0 h 15 min | Excel predložak: list po sekciji, oblikovan kao tablica, padajuće liste; testovi i provjera |
| 21.11.2026. | 09:31–09:50 | 0 h 19 min | Sigurnost (zaglavlja, ograničenja uvoza, upozorenje uz link, ovisnosti), sređivanje dokumentacije, push, priprema predaje |
| | | **1 h 18 min** | |

**Ukupno (faze 1–4): ≈ 4 h 07 min**

## Napomena

Stvarno vrijeme je znatno kraće od predviđenih 6 h, jer je implementaciju radio AI agent, a moje vrijeme je otišlo na:

- usmjeravanje
- donošenje odluka (pristup, pretpostavke, stack, opseg dorada)
- pregled aplikacije
- provjeru rezultata

Realna procjena bez AI alata:

- **faza 1:** 8–10 h. Najviše vremena bi otišlo na solver i njegovu provjeru (oko 3 h), UI s kartom (oko 3 h) te testove i dokumentaciju (oko 2 h).
- **faza 2:** 3–4 dana. Najviše vremena bi otišlo na heuristiku i njezino mjerenje, integraciju karata i geokodiranja te novi raspored ekrana.
