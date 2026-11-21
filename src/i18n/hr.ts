import { hrPlural } from './plural'

/**
 * Croatian (source) catalog. Values are strings or functions of one parameter object.
 * Other catalogs must define the same keys with the same parameters (checked by TypeScript).
 */
export const hr = {
  // ---------- input validation ----------
  'in.dupLocations': (p: { ids: string }) => `Duplicirane oznake lokacija: ${p.ids}`,
  'in.dupMachines': (p: { ids: string }) => `Duplicirane oznake strojeva: ${p.ids}`,
  'in.dupOrders': (p: { ids: string }) => `Duplicirane oznake naloga: ${p.ids}`,
  'in.dupTrucks': (p: { ids: string }) => `Duplicirane oznake kamiona: ${p.ids}`,
  'in.noLocations': 'Nema nijedne lokacije.',
  'in.noBase': (p: { id: string }) => `Baza ${p.id || '(nije odabrana)'} ne postoji među lokacijama.`,
  'in.noTrucks': 'Nema nijednog kamiona.',
  'in.noOrders': 'Nema nijednog naloga.',
  'in.capacity': (p: { name: string }) => `${p.name}: nosivost mora biti veća od 0.`,
  'in.maxItems': (p: { name: string }) => `${p.name}: maksimalan broj strojeva mora biti cijeli broj ≥ 1.`,
  'in.weight': (p: { id: string }) => `Stroj ${p.id}: težina mora biti veća od 0.`,
  'in.latLon': (p: { id: string }) =>
    `Lokacija ${p.id}: geografska širina mora biti između -90 i 90, a dužina između -180 i 180.`,
  'in.xy': (p: { id: string }) => `Lokacija ${p.id}: koordinate moraju biti brojevi.`,
  'in.orderMachine': (p: { id: string; machine: string }) => `Nalog ${p.id}: stroj ${p.machine} ne postoji.`,
  'in.orderPickup': (p: { id: string; loc: string }) => `Nalog ${p.id}: lokacija preuzimanja ${p.loc} ne postoji.`,
  'in.orderDelivery': (p: { id: string; loc: string }) => `Nalog ${p.id}: lokacija isporuke ${p.loc} ne postoji.`,
  'in.orderSame': (p: { id: string; loc: string }) =>
    `Nalog ${p.id}: preuzimanje i isporuka su na istoj lokaciji (${p.loc}).`,
  'in.orderPickupMin': (p: { id: string }) =>
    `Nalog ${p.id}: vrijeme utovara mora biti broj ≥ 0 (ili prazno za zadanu vrijednost).`,
  'in.orderDeliveryMin': (p: { id: string }) =>
    `Nalog ${p.id}: vrijeme istovara mora biti broj ≥ 0 (ili prazno za zadanu vrijednost).`,
  'in.machineTwice': (p: { id: string }) => `Stroj ${p.id} se pojavljuje u više naloga.`,
  'in.speed': 'Brzina mora biti veća od 0.',
  'in.handling': 'Vrijeme utovara/istovara ne smije biti negativno.',
  'in.limit': 'Dnevni limit mora biti veći od 0.',
  'in.break': 'Trajanje pauze ne smije biti negativno.',
  'in.roadMissing': (p: { ids: string }) => `Cestovne udaljenosti nisu učitane za lokacije: ${p.ids}.`,
  'in.roadNoPath': 'Servis za rute nije našao cestovni put između nekih lokacija.',
  'in.roadNoTime': 'Servis za rute nije vratio vrijeme vožnje između nekih lokacija.',
  'in.balancePct': 'Dopušteno povećanje km za ravnomjernu raspodjelu mora biti ≥ 0 %.',
  'in.truckMax': 'Najveća brzina kamiona mora biti veća od 0.',
  'in.roadFactor': 'Faktor ceste mora biti ≥ 1 (cesta nije kraća od zračne linije).',
  'in.exactTooMany': (p: { max: number; n: number }) =>
    `Egzaktni solver podržava najviše ${p.max} naloga (zadano: ${p.n}). Odaberi "Automatski" ili "Heuristika".`,

  // ---------- unassigned reasons ----------
  'why.tooHeavy': (p: { machine: string; kg: string; max: string }) =>
    `Stroj ${p.machine} (${p.kg}) teži je od nosivosti svih kamiona (najveća ${p.max}).`,
  'why.tooLong': (p: { hours: string; limit: number }) =>
    `Nalog ne stane u radni dan ni kad ga kamion vozi sam (najmanje ${p.hours} h, limit ${p.limit} h).`,
  'why.heuristic': (p: { limit: number; served: number }) =>
    `Zbog dnevnog limita od ${p.limit} h heuristika nije našla mjesto za ovaj nalog uz ostalih ${p.served} izvršenih naloga (heuristika ne jamči optimum; za ≤ 12 naloga koristi egzaktni solver).`,
  'why.exact': (p: { limit: number; served: number; total: number }) =>
    `Zbog dnevnog limita od ${p.limit} h kamioni mogu izvršiti najviše ${p.served} od ${p.total} naloga; ovaj nalog je izostavljen jer optimalni raspored s najmanje km ne uključuje njega.`,

  // ---------- plan validator ----------
  'val.short': (p: { name: string }) => `${p.name}: ruta mora imati barem polazak i povratak.`,
  'val.start': (p: { name: string; base: string }) => `${p.name}: ruta ne kreće iz baze ${p.base}.`,
  'val.end': (p: { name: string; base: string }) => `${p.name}: ruta se ne vraća u bazu ${p.base}.`,
  'val.breakMove': (p: { name: string; i: number }) => `${p.name}, korak ${p.i}: pauza mora biti na mjestu, bez vožnje.`,
  'val.leg': (p: { name: string; i: number; km: number; expected: number }) =>
    `${p.name}, korak ${p.i}: dionica ${p.km} km, očekivano ${p.expected} km.`,
  'val.legTime': (p: { name: string; i: number }) => `${p.name}, korak ${p.i}: vrijeme vožnje dionice ne odgovara.`,
  'val.unknownOrder': (p: { name: string; i: number; id: string }) => `${p.name}, korak ${p.i}: nepoznat nalog ${p.id}.`,
  'val.pickupAt': (p: { name: string; id: string; at: string; expected: string }) =>
    `${p.name}: ${p.id} preuzet na ${p.at}, a treba na ${p.expected}.`,
  'val.pickedTwice': (p: { name: string; id: string }) => `${p.name}: ${p.id} preuzet više puta.`,
  'val.deliveryAt': (p: { name: string; id: string; at: string; expected: string }) =>
    `${p.name}: ${p.id} isporučen na ${p.at}, a treba na ${p.expected}.`,
  'val.deliveredBefore': (p: { name: string; id: string }) =>
    `${p.name}: ${p.id} isporučen prije preuzimanja ili ga ovaj kamion nije preuzeo.`,
  'val.overweight': (p: { name: string; i: number; kg: number; cap: number }) =>
    `${p.name}, korak ${p.i}: opterećenje ${p.kg} kg > nosivost ${p.cap} kg.`,
  'val.overcount': (p: { name: string; i: number; n: number; max: number }) =>
    `${p.name}, korak ${p.i}: ${p.n} strojeva > maksimum ${p.max}.`,
  'val.loadShown': (p: { name: string; i: number }) => `${p.name}, korak ${p.i}: prikazano opterećenje ne odgovara stvarnom.`,
  'val.returnsLoaded': (p: { name: string; ids: string }) => `${p.name}: vraća se u bazu sa strojevima ${p.ids}.`,
  'val.servedTwice': (p: { id: string }) => `${p.id} izvršava više kamiona.`,
  'val.totalKm': (p: { name: string; total: number; sum: number }) =>
    `${p.name}: ukupno ${p.total} km, zbroj dionica je ${p.sum} km.`,
  'val.breaks': (p: { name: string; n: number; expected: number }) =>
    `${p.name}: ${p.n} pauza u ruti, očekivano ${p.expected}.`,
  'val.overLimit': (p: { name: string; limit: number }) => `${p.name}: prekoračen dnevni limit od ${p.limit} h.`,
  'val.timeShown': (p: { name: string }) =>
    `${p.name}: prikazano radno vrijeme ne odgovara zbroju vožnje, utovara/istovara i pauze.`,
  'val.times': (p: { name: string; i: number }) => `${p.name}, korak ${p.i}: vremena dolaska i odlaska nisu u redu.`,
  'val.bothServed': (p: { id: string }) => `${p.id} je i izvršen i označen kao neraspoređen.`,
  'val.silent': (p: { id: string }) => `${p.id} nije izvršen, a nema upozorenja.`,

  // ---------- data names ----------
  'data.truckName': (p: { id: string }) => `Kamion ${p.id}`,
  'data.vehicleN': (p: { n: number }) => `Vozilo ${p.n}`,

  // ---------- JSON / link import ----------
  'io.unknownFormat': (p: { format: string }) => `Nepoznat format datoteke: ${p.format}.`,
  'io.noData': 'Datoteka ne sadrži podatke planera.',
  'io.notList': (p: { key: string }) => `Polje "${p.key}" mora biti lista.`,
  'io.badRecord': (p: { key: string; i: number }) => `${p.key}[${p.i}] nije ispravan zapis.`,
  'io.badJson': 'Datoteka nije ispravan JSON.',
  'io.badLink': 'Link je oštećen ili nepotpun.',

  // ---------- CSV import ----------
  'csv.row': (p: { line: number; text: string }) => `Red ${p.line}: ${p.text}`,
  'csv.empty': 'CSV je prazan.',
  'csv.missingColumns': (p: { section: string; cols: string; header: string }) =>
    `CSV nema stupce (${p.section}): ${p.cols}. Očekivano zaglavlje: ${p.header}`,
  'csv.noTruckId': 'nedostaje oznaka vozila.',
  'csv.capacity': 'nosivost mora biti broj veći od 0.',
  'csv.maxItems': 'max_strojeva mora biti cijeli broj ≥ 1.',
  'csv.dupTrucks': (p: { ids: string }) => `Oznake vozila se ponavljaju: ${p.ids}.`,
  'csv.noTrucks': 'CSV nema nijednog vozila.',
  'csv.noLocationId': 'nedostaje oznaka lokacije.',
  'csv.twoBases': (p: { base: string }) => `baza je već ${p.base}; označi samo jednu bazu.`,
  'csv.xy': 'x_km i y_km moraju biti brojevi.',
  'csv.latLon': 'lat mora biti između -90 i 90, a lon između -180 i 180.',
  'csv.noPosition': 'upiši koordinate (x_km, y_km ili lat, lon) ili adresu.',
  'csv.dupLocations': (p: { ids: string }) => `Oznake lokacija se ponavljaju: ${p.ids}.`,
  'csv.noLocations': 'CSV nema nijedne lokacije.',
  'csv.noOrderId': 'nedostaje oznaka naloga ili stroja.',
  'csv.weight': 'težina mora biti broj veći od 0.',
  'csv.noPickup': (p: { loc: string }) => `lokacija preuzimanja "${p.loc}" ne postoji.`,
  'csv.noDelivery': (p: { loc: string }) => `lokacija isporuke "${p.loc}" ne postoji.`,
  'csv.sameLocation': (p: { loc: string }) => `preuzimanje i isporuka su na istoj lokaciji (${p.loc}).`,
  'csv.minutes': (p: { col: string }) => `${p.col} mora biti broj ≥ 0.`,
  'csv.noOrders': 'CSV nema nijednog naloga.',
  'csv.brokenOrders': (p: { ids: string }) =>
    `Nalozi ${p.ids} koriste lokacije kojih nema u CSV-u. Dodaj te lokacije ili najprije učitaj nove naloge.`,
  'csv.unknownSection': (p: { name: string }) =>
    `nepoznata sekcija "${p.name}". Dopuštene su #VOZILA, #LOKACIJE i #NALOZI.`,
  'csv.sectionTwice': (p: { name: string }) => `sekcija "${p.name}" se pojavljuje dvaput.`,
  'csv.noSections':
    'CSV mora imati sekcije: red "#VOZILA", "#LOKACIJE" ili "#NALOZI", a ispod njega zaglavlje i podatke. Preuzmi predložak.',
  'csv.yes': 'da',
  'csv.exBase': 'Baza',
  'csv.exSite': 'Gradilište Ilica',
  'csv.exStore': 'Skladište Velika Gorica',

  // ---------- import / export panel ----------
  'io.title': 'Uvoz / izvoz / dijeljenje',
  'io.csvHelp':
    'Excel (CSV): jedan predložak s tri sekcije (vozila, lokacije, nalozi). Preuzmi ga, upiši podatke i učitaj. Sekcija koje nema u datoteci ostaje nepromijenjena. Lokacije mogu imati samo adresu, a koordinate se onda traže automatski.',
  'io.csvLabel': 'Vozila, lokacije i nalozi (CSV)',
  'io.jsonLabel': 'Cijeli skup s postavkama (JSON)',
  'io.linkLabel': 'Link s podacima',
  'io.template': 'Predložak',
  'io.download': 'Preuzmi',
  'io.upload': 'Učitaj…',
  'io.copyLink': 'Kopiraj link',
  'io.uploadCsvAria': 'Učitaj vozila, lokacije i naloge iz CSV-a',
  'io.uploadJsonAria': 'Učitaj cijeli skup iz JSON-a',
  'io.fileTemplate': 'predlozak-uprent',
  'io.fileData': 'podaci',
  'io.loaded': (p: { trucks: number; locations: number; orders: number }) =>
    `Učitano: ${p.trucks} vozila, ${p.locations} lokacija, ${p.orders} naloga.`,
  'io.modeBase': (p: { mode: string; base: string }) => `Način: ${p.mode}, baza ${p.base}.`,
  'io.addressesFound': (p: { found: number; n: number }) => `Adrese pronađene: ${p.found}/${p.n}.`,
  'io.notFound': (p: { list: string }) =>
    `Nije pronađeno: ${p.list}. Upiši koordinate ručno ili klikni lokaciju na karti.`,
  'io.geocoding': (p: { i: number; n: number; address: string }) => `Tražim adrese ${p.i}/${p.n}: ${p.address}`,
  'io.linkCopied': (p: { n: string }) =>
    `Link je kopiran (${p.n} znakova). Podaci su u samom linku; ništa se ne šalje na server.`,
  'io.linkFailed': (p: { why: string }) => `Link nije kopiran: ${p.why}`,
  'io.more': (p: { n: number }) => `… i još ${p.n}`,

  // ---------- coordinate mode ----------
  'mode.xy': 'koordinatni sustav',
  'mode.xyTask': 'Koordinatni sustav (zadatak)',
  'mode.geo': 'Stvarna karta',
  'mode.aria': 'Način lokacija',
  'mode.loadExample': 'Učitaj primjer: okolica Zagreba',
  'mode.confirm': (p: { locations: number; orders: number }) =>
    `Promjena načina briše lokacije (${p.locations}) i naloge (${p.orders}), jer koordinate jednog načina ne vrijede u drugom. Vozila i postavke ostaju. Nastaviti?`,
  'mode.confirmBtn': 'Promijeni i obriši',
  'data.base': 'Baza',

  // ---------- editing ----------
  'edit.baseBlocked': (p: { id: string }) =>
    `Baza ${p.id} se ne može obrisati dok postoje nalozi. Sve rute počinju i završavaju u bazi; najprije odaberi drugu bazu ili obriši naloge.`,
  'edit.locationUsed': (p: { id: string; n: number; ids: string }) =>
    `Lokacija ${p.id} se koristi u ${p.n === 1 ? 'nalogu' : 'nalozima'} ${p.ids}. Obrisati lokaciju i ${p.n === 1 ? 'taj nalog' : 'te naloge'}?`,
  'edit.needTwoLocations': 'Za nalog trebaju barem dvije lokacije (preuzimanje i isporuka).',

  // ---------- common ----------
  'common.delete': 'Obriši',
  'common.cancel': 'Odustani',
  'common.ok': 'U redu',
  'common.close': 'Zatvori',

  // ---------- input tables ----------
  'tbl.customTime': (p: { min: number }) => `Posebno vrijeme (zadano je ${p.min} min)`,
  'tbl.defaultTime': (p: { min: number }) => `Zadano: ${p.min} min`,
  'tbl.vehicle': 'Vozilo',
  'tbl.capacityKg': 'Nosivost (kg)',
  'tbl.maxMachines': 'Max strojeva',
  'tbl.vehicleNameAria': (p: { id: string }) => `Naziv vozila ${p.id}`,
  'tbl.remove': (p: { name: string }) => `Ukloni ${p.name}`,
  'tbl.noVehicles': 'Nema vozila.',
  'tbl.addVehicle': 'Dodaj vozilo',
  'tbl.allFromBase': (p: { base: string }) => `Sva vozila polaze iz baze ${p.base} i vraćaju se u nju.`,
  'tbl.deleteLocationAndOrders': 'Obriši lokaciju i naloge',
  'tbl.name': 'Naziv',
  'tbl.lat': 'Širina',
  'tbl.lon': 'Dužina',
  'tbl.locationNameAria': (p: { id: string }) => `Naziv lokacije ${p.id}`,
  'tbl.isBase': (p: { id: string }) => `${p.id} je baza`,
  'tbl.removeLocation': (p: { id: string }) => `Ukloni lokaciju ${p.id}`,
  'tbl.noLocations': 'Nema lokacija. Prva dodana lokacija postaje baza.',
  'tbl.noLocationsGeo': 'Klikni na kartu ili potraži adresu.',
  'tbl.addLocation': 'Dodaj lokaciju',
  'tbl.newLocationHint': 'Bez karte nova lokacija dobiva koordinate središta Zagreba.',
  'tbl.flaggedNote': (p: { n: number }) =>
    `${p.n} ${hrPlural(p.n, 'nalog je označen', 'naloga su označena', 'naloga je označeno')} žuto: u rezultatu ${p.n === 1 ? 'ima' : 'imaju'} upozorenje (razlog je ispod naloga).`,
  'tbl.pickupAria': (p: { id: string }) => `Preuzimanje ${p.id}`,
  'tbl.deliveryAria': (p: { id: string }) => `Isporuka ${p.id}`,
  'tbl.removeOrder': (p: { id: string }) => `Ukloni nalog ${p.id}`,
  'tbl.machineKg': (p: { id: string }) => `Stroj ${p.id} (kg)`,
  'tbl.loadingMin': 'Utovar (min)',
  'tbl.unloadingMin': 'Istovar (min)',
  'tbl.noOrders': 'Nema naloga.',
  'tbl.addOrder': 'Dodaj nalog',
  'tbl.handlingHint': (p: { min: number }) =>
    `Utovar/istovar: prazno = zadano (${p.min} min); veći teret može imati duže vrijeme. Preuzimanje i isporuka ne mogu biti na istoj lokaciji.`,

  // ---------- settings ----------
  'set.dailyLimit': 'Dnevni limit (h)',
  'set.handling': 'Utovar / istovar (min)',
  'set.speed': 'Prosječna brzina (km/h)',
  'set.speedFallback': 'Prosječna brzina, rezerva (km/h)',
  'set.speedFallbackTitle':
    'Koristi se samo ako servis za rute ne vrati vrijeme vožnje ili kad je odabrano „Prosječna brzina”.',
  'set.truckMax': 'Najveća brzina kamiona (km/h)',
  'set.truckMaxTitle':
    'Servis za rute računa vrijeme za osobni automobil. Kamion na relaciji ne može ići brže od ove prosječne brzine (u HR 80 km/h na autocesti za kamione).',
  'set.roadFactor': 'Faktor ceste',
  'set.roadFactorTitle': 'Zračna udaljenost × faktor ≈ udaljenost po cesti',
  'set.break': 'Obavezna pauza (gablec)',
  'set.breakAria': 'Trajanje pauze (min)',
  'set.objective': 'Cilj optimizacije',
  'set.objectiveKm': 'Najmanje km',
  'set.objectiveBalanced': 'Ravnomjerna raspodjela',
  'set.objectiveKmHelp': 'Najviše izvršenih naloga, zatim najmanje ukupnih kilometara (zadatak).',
  'set.objectiveBalancedHelp': (p: { pct: number }) =>
    `Najviše izvršenih naloga, zatim što kraći najduži radni dan (posao ravnomjernije po vozilima), uz najviše +${p.pct} % km u odnosu na najkraći plan; među takvim planovima najmanje km. Egzaktno do 12 naloga.`,
  'set.balancePct': 'Najviše dodatnih km',
  'set.limitWhat': 'Što ulazi u dnevni limit',
  'set.limitDriveHandling': 'Vožnja + utovar/istovar',
  'set.limitDriveHandlingHelp':
    'Radni dan vozača: vrijeme vožnje plus utovar/istovar svake radnje (i pauza, ako je uključena). Zadana pretpostavka.',
  'set.limitDrive': 'Samo vožnja',
  'set.limitDriveHelp': 'U limit se računa samo vrijeme vožnje, bez utovara i pauze.',
  'set.limitNone': 'Bez limita',
  'set.limitNoneHelp': 'Čista minimizacija kilometara, služi za usporedbu.',
  'set.distances': 'Udaljenosti na stvarnoj karti',
  'set.distRoad': 'Po cestama (OSRM)',
  'set.distAir': 'Zračna × faktor',
  'set.distRoadHelp':
    'Stvarne udaljenosti vožnje po cestovnoj mreži (OpenStreetMap, OSRM). Ako servis nije dostupan, koristi se zračna udaljenost × faktor.',
  'set.distAirHelp': (p: { f: number }) => `Zračna udaljenost × ${p.f}: radi bez interneta, ali je samo procjena.`,
  'set.travelTime': 'Vrijeme vožnje',
  'set.timeRoad': 'Po relaciji (OSRM)',
  'set.timeSpeed': 'Prosječna brzina',
  'set.timeRoadHelp': (p: { vmax: number }) =>
    `Brzina se računa za svaku relaciju iz vremena vožnje po cestama (OSRM): npr. Zagreb – Karlovac (centar – centar) 55,1 km za 48 min ≈ 69 km/h, a gradska dionica je sporija. Kamion na relaciji ne ide brže od ${p.vmax} km/h. Brzina svake dionice vidi se u tablici rute.`,
  'set.timeSpeedHelp': (p: { v: number }) => `Vrijeme vožnje = km / ${p.v} km/h za svaku dionicu.`,
  'set.xySpeedNote': (p: { v: number }) =>
    `Koordinatni sustav iz zadatka nema ceste, pa se vrijeme vožnje računa prosječnom brzinom (${p.v} km/h). Brzina po relaciji radi na stvarnoj karti.`,
  'set.solver': 'Solver',
  'set.solverAutoLabel': 'Automatski',
  'set.solverExactLabel': 'Egzaktni',
  'set.solverHeuristicLabel': 'Heuristika',
  'set.solverMaxTitle': (p: { max: number }) => `Najviše ${p.max} naloga`,
  'set.solverAutoMany': (p: { n: number; max: number }) =>
    `${p.n} naloga > ${p.max}: koristit će se heuristika (brza, bez jamstva optimuma).`,
  'set.solverAuto': (p: { max: number }) =>
    `Do ${p.max} naloga egzaktni solver (dokazivo optimalan), iznad toga heuristika.`,
  'set.solverExactMany': (p: { n: number; max: number }) =>
    `Egzaktni solver podržava najviše ${p.max} naloga (sada ${p.n}). Odaberi Automatski ili Heuristiku.`,
  'set.solverExact': 'Dokazivo optimalan raspored (dinamičko programiranje).',
  'set.solverHeuristic':
    'Umetanje + lokalna pretraga + ruin & recreate. Brzo i za 50+ naloga, ali bez jamstva optimuma.',

  // ---------- app shell ----------
  'app.noRoads': (p: { why: string; f: number }) =>
    `Cestovne udaljenosti trenutno nisu dostupne (${p.why}). Plan je izračunat sa zračnom udaljenosti × faktor ceste ${p.f} i prosječnom brzinom.`,
  'app.sharedLoaded': (p: { trucks: number; locations: number; orders: number }) =>
    `Učitani su podaci iz linka: ${p.trucks} vozila, ${p.locations} lokacija, ${p.orders} naloga.`,
  'app.sharedFailed': 'Podatke iz linka nije moguće učitati.',
  'app.tabVehicles': 'Vozila',
  'app.tabLocations': 'Lokacije',
  'app.tabOrders': 'Nalozi',
  'app.tabSettings': 'Postavke',
  'app.flaggedTab': (p: { n: number }) => `${p.n} ${hrPlural(p.n, 'nalog ima', 'naloga imaju', 'naloga ima')} upozorenje u rezultatu`,
  'app.hideInput': 'Sakrij ulazne podatke',
  'app.showInput': 'Prikaži ulazne podatke',
  'app.hideInputWide': 'Zatvori ulazne podatke i proširi rezultat',
  'app.fullScreen': 'Ulazni podaci preko cijelog ekrana',
  'app.splitView': 'Natrag na podijeljeni prikaz',
  'app.slogan': 'Najam • Prodaja • Servis • Transport',
  'app.language': 'Jezik',
  'app.drawerAria': 'Ulazni podaci i ograničenja',
  'app.inputTitle': 'Ulazni podaci',
  'app.loadTask': 'Vrati podatke iz zadatka',
  'app.clearAll': 'Obriši sve',
  'app.clearConfirm': (p: { trucks: number; locations: number; orders: number }) =>
    `Obrisati sva vozila (${p.trucks}), lokacije (${p.locations}) i naloge (${p.orders})? Postavke ostaju.`,
  'app.loadingMap': 'Učitavam kartu…',
  'app.staleInput': 'Podaci su promijenjeni. Pokreni optimizaciju ponovno.',
  'app.computing': 'Računam rute…',
  'app.optimise': 'Optimiziraj raspored',
  'app.emptyTitle': 'Još nema podataka za planiranje',
  'app.emptyText':
    'Dodaj vozila, lokacije i naloge u lijevom izborniku ili učitaj primjer iz zadatka (2 kamiona, 10 lokacija, 10 naloga).',
  'app.readyTitle': 'Podaci su spremni',
  'app.readyText': 'Pokreni optimizaciju gumbom „Optimiziraj raspored”.',
  'app.inputInvalid': 'Ulazni podaci nisu ispravni:',
  'app.footer':
    'Egzaktni solver (dinamičko programiranje) do 12 naloga, iznad toga heuristika · udaljenosti zaokružene na 0,1 km po dionici',
  'app.disclaimer': 'Prototip izrađen u sklopu selekcijskog zadatka, nije službeni proizvod Up Rent d.o.o.',

  // ---------- results ----------
  'res.title': 'Rezultat',
  'res.stale': 'Prikazan je rezultat za prethodne podatke.',
  'res.totalKm': 'Ukupna kilometraža',
  'res.ordersDone': 'Izvršeni nalozi',
  'res.trucksUsed': 'Vozila u upotrebi',
  'res.check': 'Provjera ograničenja',
  'res.violations': (p: { n: number }) => `${p.n} ${hrPlural(p.n, 'kršenje', 'kršenja', 'kršenja')}`,
  'res.allOk': 'Sve OK',
  'res.solver': 'Solver',
  'res.exactTitle': 'Dokazivo optimalan raspored',
  'res.heuristicTitle': 'Heuristika: bez jamstva optimuma',
  'res.goalBalanced': 'Ravnomjerno',
  'res.goal': 'Cilj',
  'res.driveTime': 'Vrijeme vožnje',
  'res.timeRoad': 'po relaciji',
  'res.timeRoadTitle': 'Vrijeme svake dionice iz servisa za rute (OSRM), ograničeno najvećom brzinom kamiona',
  'res.timeSpeed': (p: { v: number }) => `${p.v} km/h`,
  'res.solveTime': 'Vrijeme izračuna',
  'res.heuristicNote': (p: { n: number }) =>
    `Raspored je izračunala heuristika (${p.n} naloga). Rezultat je valjan prema svim pravilima, ali nema jamstva da je najkraći mogući. Za ≤ 12 naloga koristi se egzaktni solver.`,
  'res.timeFallbackNote':
    'Uz brzinu po relaciji najkraća ruta nije uvijek i najbrža. Za neke kombinacije naloga najkraća ruta prelazi dnevni limit, pa je korištena najbrža ruta koja stane u dan. Raspored je valjan, ali optimum po km tada nije dokazan.',
  'res.unassignedTitle': (p: { n: number }) =>
    `Upozorenje: ${p.n} ${hrPlural(p.n, 'nalog nije moguće izvršiti', 'naloga nije moguće izvršiti', 'naloga nije moguće izvršiti')}`,
  'res.showInInput': 'Prikaži u unosu',
  'res.validatorTitle': 'Validator je pronašao kršenja pravila:',
  'res.idleTitle': (p: { name: string; min: string }) => `${p.name} je slabo iskorišten (${p.min}).`,
  'res.idleText': (p: { moves: string; km: string; delta: string; times: string; pct: number }) =>
    `Ako ti je važnija ravnomjerna raspodjela posla: ${p.moves}. Tada je ukupno ${p.km} (+${p.delta}), a radno vrijeme je ${p.times}. (Ravnomjerna raspodjela, najviše +${p.pct} % km.)`,
  'res.idleMove': (p: { truck: string; ids: string }) => `${p.truck} vozi ${p.ids}`,
  'res.applyBalanced': 'Primijeni ravnomjernu raspodjelu',
  'res.assignment': 'Raspodjela naloga',
  'res.filterAria': 'Filter vozila',
  'res.printAll': 'Ispis za vozače',
  'res.show': 'Prikaži:',
  'res.all': 'Sva',
  'res.none': 'Nijedno',
  'res.noOrders': 'bez naloga',

  // ---------- route actions ----------
  'act.start': 'Polazak',
  'act.pickup': 'Preuzimanje',
  'act.delivery': 'Isporuka',
  'act.break': 'Pauza',
  'act.return': 'Povratak',

  // ---------- truck result ----------
  'truck.maxMachines': (p: { n: number }) => `max ${p.n} ${hrPlural(p.n, 'stroj', 'stroja', 'strojeva')}`,
  'truck.gmapsTitle': 'Otvara rutu s redoslijedom stanica u Google kartama (nova kartica)',
  'truck.gmaps': 'Otvori u Google kartama',
  'truck.gmapsPart': (p: { i: number; n: number }) => `Google karte ${p.i}/${p.n}`,
  'truck.print': 'Ispis za vozača',
  'truck.km': 'Kilometraža',
  'truck.drive': 'Vožnja',
  'truck.handling': 'Utovar / istovar',
  'truck.total': 'Ukupno radno vrijeme',
  'truck.idle': 'Kamion ne dobiva nijedan nalog: raspored ne treba ovo vozilo.',
  'truck.location': 'Lokacija',
  'truck.action': 'Radnja',
  'truck.orderMachine': 'Nalog / stroj',
  'truck.leg': 'Dionica',
  'truck.speed': 'Brzina',
  'truck.speedTitle': 'Prosječna brzina dionice = km / vrijeme vožnje te dionice',
  'truck.cumulative': 'Ukupno',
  'truck.load': 'Opterećenje nakon radnje',
  'truck.time': 'Dolazak – odlazak',
  'truck.timeTitle': 'Dolazak – odlazak (od početka radnog dana)',
  'truck.limitNote': (p: { h: string; max: number }) => `Računato prema limitu: ${p.h} od ${p.max} h.`,

  // ---------- timeline ----------
  'tl.title': 'Vremenska linija',
  'tl.subtitle': (p: { start: string }) => `Radni dan po vozilu; početak u ${p.start} (pretpostavka)`,
  'tl.noneSelected': 'Nijedno vozilo nije odabrano.',
  'tl.limit': (p: { h: number }) => `Dnevni limit ${p.h} h`,
  'tl.idle': 'bez naloga',
  'tl.tipDrive': (p: { from: string; to: string; km: string; time: string; kmh: number }) =>
    `Vožnja ${p.from} → ${p.to}: ${p.km}, ${p.time}, prosječno ${p.kmh} km/h`,
  'tl.tipStop': (p: { action: string; loc: string; order: string; time: string; load: string }) =>
    `${p.action} na ${p.loc}${p.order}: ${p.time}; teret nakon radnje ${p.load}`,
  'tl.keyDrive': 'Vožnja (km)',
  'tl.keyPickup': 'Utovar (lokacija)',
  'tl.keyDelivery': 'Istovar (lokacija)',
  'tl.help': 'Klik na blok označava korak u tablici rute; prijeđi mišem (ili dodirni) za detalje.',

  // ---------- maps ----------
  'map.titleXy': 'Karta ruta (koordinatni sustav)',
  'map.aria': 'Karta lokacija i ruta kamiona',
  'map.gridNote': (p: { step: number; minor: number }) =>
    `Mreža ${p.step} km${p.minor ? ' (tanke linije svakih 1 km)' : ''}; brojevi na osima su koordinate u km. Udaljenosti su ravne linije (euklidske).`,

  // ---------- driver sheet ----------
  'sheet.start': 'Polazak',
  'sheet.pickup': 'Utovar',
  'sheet.delivery': 'Istovar',
  'sheet.break': 'Pauza',
  'sheet.return': 'Povratak',
  'sheet.title': 'Plan vožnje',
  'sheet.sub': (p: { kg: string; n: number; base: string }) =>
    `Nosivost ${p.kg} · najviše ${p.n} ${hrPlural(p.n, 'stroj', 'stroja', 'strojeva')} · baza ${p.base}`,
  'sheet.date': 'Datum',
  'sheet.time': 'Vrijeme',
  'sheet.loadAfter': 'Teret nakon',
  'sheet.note': (p: { speed: string; drive: string; handling: string; brk: string }) =>
    `Okvirno vrijeme uz početak rada u 07:00 i ${p.speed}. Vožnja ${p.drive}, utovar/istovar ${p.handling}${p.brk ? `, pauza ${p.brk}` : ''}.`,
  'sheet.speedRoad': 'vrijeme vožnje po relaciji (ceste, OSRM)',
  'sheet.speedAvg': (p: { v: number }) => `prosječnu brzinu ${p.v} km/h`,
  'sheet.driver': 'Vozač',
  'sheet.dispatcher': 'Dispečer',
  'sheet.notes': 'Napomene',
  'sheet.foot': 'Izrađeno u UP RENT Smart Logistics Planneru (prototip, nije službeni dokument Up Rent d.o.o.)',

  // ---------- real map ----------
  'geo.title': 'Karta ruta',
  'geo.approx': (p: { query: string; address: string }) => `${p.query} (približno: ${p.address})`,
  'geo.placeholder': 'Adresa, mjesto ili koordinate / Google Maps link',
  'geo.searchAria': 'Traži adresu',
  'geo.onlyHr': 'samo HR',
  'geo.searching': 'Tražim…',
  'geo.noResults': 'Nema rezultata.',
  'geo.searchDown': (p: { error: string }) =>
    `Pretraga trenutno ne radi (${p.error}). Klikni na kartu ili upiši koordinate ručno.`,
  'geo.noHouseNumber':
    'Kućni broj nije u OpenStreetMap podacima: marker će biti na ulici, povuci ga na točno mjesto.',
  'geo.editorHelp':
    'Klik na kartu dodaje lokaciju, a marker se može povući mišem. Pretraga: Nominatim / OpenStreetMap (najviše 1 upit u sekundi). Kućni brojevi postoje samo gdje su upisani u OpenStreetMap; za točnu lokaciju zalijepi koordinate ili link iz Google karata (desni klik na mjesto → kopiraj koordinate).',
  'geo.loadingRoutes': 'Učitavam cestovne rute…',
  'geo.routesDown': 'Servis za rute nije dostupan: prikazane su ravne linije između lokacija.',
  'geo.routesOk': 'Rute po cestama (OpenStreetMap, OSRM).',
  'geo.kmRoad': 'Km u planu su cestovne udaljenosti.',
  'geo.kmAir': (p: { f: number }) => `Km u planu: zračna udaljenost × faktor ${p.f}.`,
  'route.tooMany': (p: { max: number }) => `Javni servis za rute podržava najviše ${p.max} lokacija.`,
  'route.status': (p: { status: number }) => `Servis za rute je vratio ${p.status}.`,
  'route.error': (p: { msg: string }) => `Servis za rute: ${p.msg}.`,
  'geo.nominatimStatus': (p: { status: number }) => `Nominatim je vratio ${p.status}`,
  'geo.point': (p: { lat: string; lon: string }) => `Točka ${p.lat}, ${p.lon}`,
  'geo.coords': (p: { lat: string; lon: string }) => `Koordinate ${p.lat}, ${p.lon}`,

  // ---------- scenario comparison ----------
  'sc.title': 'Usporedba scenarija',
  'sc.busy': 'Računam…',
  'sc.again': 'Izračunaj ponovno',
  'sc.run': 'Usporedi scenarije',
  'sc.intro': (p: { h: number }) =>
    `Isti podaci, tri tumačenja radnog dana: bez limita, limit ${p.h} h i limit uz obaveznu pauzu. Pokazuje koliko km „košta” svako ograničenje i zašto se raspored mijenja.`,
  'sc.current': 'trenutne postavke',
  'sc.orders': (p: { done: number; n: number }) => `${p.done}/${p.n} naloga`,
  'sc.apply': 'Primijeni ovaj scenarij',
  'sc.moves': (p: { ids: string; n: number; truck: string }) => `${p.ids} ${p.n === 1 ? 'prelazi' : 'prelaze'} na ${p.truck}`,
  'sc.limit': (p: { h: number }) => `Limit ${p.h} h (vožnja + utovar/istovar)`,
  'sc.limitBreak': (p: { h: number; min: number }) => `Limit ${p.h} h + pauza ${p.min} min`,
  'sc.noneWhy': 'Najkraće moguće rješenje: radno vrijeme se ne ograničava.',
  'sc.wouldWork': (p: { name: string; h: string; limit: number }) =>
    `${p.name} bi radio ${p.h} (vožnja + utovar/istovar), više od radnog dana od ${p.limit} h, pa ovaj plan u praksi nije izvediv.`,
  'sc.limitWhy': (p: { limit: number; min: number }) =>
    `Radni dan vozača ograničen je na ${p.limit} h (vožnja + ${p.min} min po utovaru/istovaru).`,
  'sc.breakWhy': (p: { min: number }) => `Svako vozilo s nalozima dobiva ${p.min} min pauze, pa u dan stane manje posla.`,
  'sc.changed': (p: { list: string }) => `Promjena rasporeda: ${p.list}.`,
  'sc.cost': (p: { km: string }) => `Cijena ograničenja: +${p.km} u odnosu na prethodni scenarij.`,
  'sc.same': 'Raspored se ne mijenja: ograničenje ovdje nije aktivno.',
  'sc.lost': (p: { n: number }) => `${p.n} ${hrPlural(p.n, 'nalog više ne stane', 'naloga više ne stanu', 'naloga više ne stane')} u radni dan.`,
  'sc.busiest': (p: { name: string; h: string; limit: number }) =>
    `Najopterećenije vozilo: ${p.name}, ${p.h} od ${p.limit} h.`,
  'app.fullShort': 'Cijeli ekran',
  'app.splitShort': 'Podijeljeni prikaz',
  'app.fullScreenWide': 'Proširi ulazne podatke na cijeli ekran',
} as const
