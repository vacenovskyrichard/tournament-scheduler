# TourneyMaker — Specifikace aplikace

> Kompletní funkční a technická specifikace turnajového plánovače **TourneyMaker**.
> Cílem je, aby podle tohoto dokumentu šla aplikace znovu postavit od nuly se
> stejným chováním. Dokument je zdrojem pravdy pro logiku — ne aktuální kód.

---

## 1. Účel a přehled

Webová aplikace pro **plánování sportovních turnajů** (primárně plážový volejbal,
dále tenis, padel, volejbal, badminton). Uživatel zadá týmy, počet kurtů a časové
okno; aplikace **vygeneruje všechny turnajové formáty, které se do okna vejdou**,
spočítá pro každý časový odhad a počet zápasů, a po výběru formátu vykreslí
kompletní **časový rozpis + skupinové tabulky + pavouka**.

Dva výstupní režimy:
- **Tisk / PDF** (`print`) — prázdná pole pro ruční zápis výsledků, optimalizováno na A4.
- **Online zápis** (`online`) — zadávání skóre přímo v prohlížeči, s automatickým
  výpočtem pořadí a propagací vítězů pavoukem.

Jazyk UI: **čeština**.

---

## 2. Technologie a architektura

- **Čistá statika**: HTML + CSS + vanilla JavaScript. **Žádný build krok, žádné
  závislosti, žádný backend, žádný framework.**
- Veškerý stav žije v paměti prohlížeče; perzistence přes `localStorage` (viz §13).
- Nasazení: statický web (GitHub Pages z větve `main`, root, `.nojekyll`).

### Struktura souborů
```
index.html        — kostra UI (3 kroky), připojuje CSS a oba JS soubory
css/style.css     — veškerý styling + tisk + responsivita
js/scheduler.js   — JÁDRO: formáty, generování options, plánovač, pavouk, skórování (čisté funkce, bez DOM)
js/app.js         — UI vrstva: state, rendering, event handlery, persistence
```
`scheduler.js` se načítá **před** `app.js`. `scheduler.js` neobsahuje žádný DOM
přístup — jsou to čisté funkce a konstanty (snadno testovatelné). `app.js` drží
stav a vykresluje.

### Globální funkce/konstanty exportované ze `scheduler.js`
`MATCH_FORMATS`, `WARMUP_MIN`, `TRANSITION`, `PHASE_BREAK`, `generateOptions`,
`buildSchedule`, `formatTime`, `minutesToHHMM`, `setsForFormat`, `matchWinner`,
`matchScoreText` (+ interní pomocné funkce). `app.js` je všechny používá přímo
(sdílený globální scope, oba `'use strict'`).

---

## 3. UI tok — 3 kroky

Jednostránková aplikace se třemi panely (`#step1`, `#step2`, `#step3`), mezi nimiž
se přepíná (ostatní jsou `hidden`). Nahoře indikátor kroků (`.steps-nav`) se stavy
`active` / `done` / `upcoming`.

### Krok 1 — Nastavení (`#step1`)
- **Sport**: tlačítka pro každý sport, vizuálně se označí vybraný.
- **Týmy**: seznam editovatelných názvů, tlačítka „+ Přidat tým" a „✕" (odebrat).
  Nový tým dostane výchozí jméno `Tým A`, `Tým B`, … (`String.fromCharCode(65 + index)`).
  Minimum 3 týmy (varování při < 3, odebrání zakázáno při ≤ 2).
- **Parametry**: posuvník Počet kurtů (1–8, výchozí 2), čas Začátek (`time`,
  výchozí 09:00), Konec (`time`, výchozí 13:00). Pod tím se zobrazuje „Dostupný čas".
- **Výstupní formát**: radio `print` / `online`.
- **Tlačítka**: „Vygenerovat možnosti →" (validuje a jde na krok 2),
  „🗑 Začít načisto" (reset, viz §13).

**Validace kroku 1** (`validateStep1`): ≥ 3 týmy; všechny týmy mají neprázdný název;
dostupný čas ≥ 30 min. Při chybě toast (pokud není `silent`).

### Krok 2 — Výběr formátu (`#step2`)
Seznam karet, jedna pro každý vyhovující formát (`generateOptions`). První karta
(nejlepší shoda) má odznak „⭐ Nejlepší shoda". Každá karta ukazuje:
- Název + odznak formátu zápasu (`shortName`).
- Popis.
- Statistiky: odhadovaný čas + odhad konce, zápasů celkem, zápasy na tým
  (`min`–`max` nebo jedno číslo), využití času v % (`fitnessScore × 100`) s barevnou
  třídou (`≥85 %` great, `≥65 %` good, jinak low).
- Pravidla formátu zápasu + délka zápasu.
- Tlačítko „Vybrat tento formát →".
- Tlačítko zpět na krok 1.

### Krok 3 — Rozpis (`#step3`)
- **Hlavička**: název (emoji sportu + sport + název formátu), podtitul (počet týmů,
  kurtů, formát), „pills" se souhrnem (čas, počet zápasů, zápasy/tým, název formátu zápasu).
- **Akce** (`.no-print`): „🖨 Tisk / PDF", „📋 Kopírovat text", „↩ Změnit formát"
  (zpět na krok 2), „← Nastavení".
- **Časový rozpis** — tabulka (viz §10).
- **Skupinové tabulky** (`#groupStandings`) — jen pro `pool_knockout` a `modified_pool` (§11).
- **Pavouk** (`#bracketView`) — jen pokud existují KO zápasy (§12).
- **Swiss view** (`#swissView`) — jen pro `swiss` (§6.6); přebírá krok 3 a skryje
  časový rozpis (`#scheduleCard`), skupiny, pavouka i legendu (`#legendCard`).
- **Legenda & pravidla** (`.no-print` se v tisku skrývá).

Na kroku 3 dostává `.main-content` třídu `wide-content` (širší layout pro pavouka).
Po každém přechodu kroku se scrolluje na vršek.

---

## 4. Datový model (`state` v app.js)

```js
state = {
  step: 1,                       // 1 | 2 | 3
  sport: 'beach_volleyball',     // klíč do SPORTS
  teams: ['Tým A','Tým B','Tým C','Tým D'],
  courts: 2,                     // 1–8
  startTime: '09:00',            // 'HH:MM'
  endTime: '13:00',
  mode: 'print',                 // 'print' | 'online'
  options: [],                   // výsledek generateOptions()
  selectedOption: null,          // jeden prvek z options
  schedule: [],                  // výsledek buildSchedule()
  scores: {},                    // klíč → string skóre, viz §12
}
```

`SPORTS` mapa: `beach_volleyball` 🏐 „Plážový volejbal", `tennis` 🎾 „Tenis",
`padel` 🎾 „Padel", `volleyball` 🏐 „Volejbal", `badminton` 🏸 „Badminton".
Sport ovlivňuje **jen popisky** (emoji + název), ne logiku plánování.

---

## 5. Formáty zápasu (`MATCH_FORMATS`)

Pole objektů. `sortPriority`: 1 = primární, 2 = dobrý když je čas, 3 = rychlý,
5 = poslední možnost. `duration` = minuty na jeden zápas.

| id | name | shortName | duration | preferred | sortPriority |
|---|---|---|---|---|---|
| `sets2_15_tb10` | 2 sety do 15 + tiebreak do 10 | 2×15 + TB10 | 30 | ano | 1 |
| `sets2_15_tb15` | 2 sety do 15 + tiebreak do 15 | 2×15 + TB15 | 40 | ano | 2 |
| `sets2_21`      | 2 sety do 21 bodů            | 2×21        | 50 | ano | 2 |
| `set1_21`       | 1 set do 21 bodů             | 1×21        | 15 | ano | 3 |
| `set1_15`       | 1 set do 15 bodů             | 1×15        | 10 | ne  | 5 |

`rules` (text pro UI): viz odpovídající popis (rozdíl 2 bodů; u 2-setových při 1:1
tiebreak).

**Počet setů na formát** (`setsForFormat(fmtId)`): formáty začínající `set1_` mají
**1 set** (1 sloupec skóre na tým), ostatní **3** (1.set, 2.set, TB).

### Časové konstanty
```
WARMUP_MIN  = 6    // rozcvičení před prvním zápasem
TRANSITION  = 3    // přestávka mezi zápasy (přičítá se ke každému slotu)
PHASE_BREAK = 10   // přestávka před play-off fází
```

---

## 6. Turnajové formáty (typy turnajů)

Pět generátorů; každý vrací objekt s odhadem nebo `null` (když pro daný počet týmů
nedává smysl). `N` = počet týmů, `C` = počet kurtů, `fmt` = formát zápasu.

Společný tvar výstupu (klíče používané dál): `id`, `type`, `name`, `desc`,
`matchFormat`, `totalMatches`, `timeSlots`, `estimatedMinutes`, `minMatchesPerTeam`,
`maxMatchesPerTeam`, `phaseBreaks` (+ typově specifická data pro `buildSchedule`).

`estimatedMinutes = calcTotalMinutes(slots, fmt.duration, phaseBreaks)` kde
`calcTotalMinutes = WARMUP_MIN + slots*(duration+TRANSITION) + phaseBreaks*PHASE_BREAK`.

`timeSlots` = počet „kol" na kurtech: zápasy v rámci jednoho kola běží paralelně na
`C` kurtech, takže každé kolo = `ceil(početZápasůVKole / C)` slotů.

### 6.1 `pool_knockout` — Skupiny + Pavouk (`calcPoolKnockout`, jen N ≥ 6)
- Vybere počet skupin `numPools` (2–8) skórovací funkcí, která preferuje:
  počet skupin ≈ počet kurtů, sudý počet skupin, vyrovnané velikosti, skupiny ≤ 4
  (velikost < 3 ukončí, > 6 přeskočí).
- Velikosti skupin co nejvyrovnanější (`ceil`/`floor` z N/numPools).
- Skupinová fáze = plný round-robin v každé skupině (`generateRRRounds`), kola napříč
  skupinami se spojují a počítají paralelně.
- **Všechny týmy postupují** do pavouka, nasazené podle pořadí ve skupině.
- `minMatchesPerTeam` = (velikost nejmenší skupiny − 1) + 1; `maxMatchesPerTeam`
  = (velikost největší skupiny − 1) + hloubka pavouka + 1 (možný zápas o 3. místo).
- `phaseBreaks = 1`. Specifická data: `poolSizes`, `poolRounds`, `numPools`, `advancers`.

### 6.2 `modified_pool` — Modifikované skupiny + Pavouk (`calcModifiedPool`)
- `findGroupMix(N, C)` najde mix skupin po **3** (plný RR → 2 zápasy/tým) a po **4**
  (modifikovaný formát → 2 zápasy/tým). **Musí obsahovat aspoň jednu 4-člennou skupinu**
  (jinak je to čisté RR = `pool_knockout`). Preferuje: počet skupin ≈ kurty, sudý
  počet skupin, méně 4-skupin. `null` když mix neexistuje.
- **4-členná skupina** = mini-pavouk: M1 = 1.vs4., M2 = 2.vs3., M3 = vítěz M1 vs vítěz M2
  (o 1./2.), M4 = poražený M1 vs poražený M2 (o 3./4.). → 4 zápasy, každý tým hraje 2.
- **3-členná skupina** = plný RR (3 zápasy, každý 2).
- Každý tým hraje **přesně 2 skupinové zápasy** bez ohledu na typ skupiny.
- Všichni postupují do pavouka. `phaseBreaks = 1`. Data: `numGroups`, `g3`, `g4`, `advancers`.

### 6.3 `double_elimination` — 2ko Pavouk (`calcDoubleElim`, jen N ≥ 4)
- Bracket size `B = 2^ceil(log2(N))`. Winners + Losers bracket + Grand Finále.
- Každý tým musí prohrát **dvakrát**. `totalMatches = 2N − 1`. `minMatchesPerTeam = 2`,
  `maxMatchesPerTeam = wbRounds + lbRounds + 1`. `phaseBreaks = 0`.
- Data: `bracketSize`, `byes`, `wbRounds`, `lbRounds`.

### 6.4 `round_robin` — Každý s každým (`calcRoundRobin`, jen 3 ≤ N ≤ 5)
- Plný round-robin, `totalMatches = N(N−1)/2`, každý tým hraje `N−1` zápasů.
- `phaseBreaks = 0`. Data: `rrRounds`.

### 6.5 `swiss` — Swiss systém (`calcSwiss`, jen N ≥ 4, **pouze online režim**)
- Počet kol = `ceil(log2(N)) + (N>8 ? 1 : 0)`. Páruje týmy se stejným počtem výher,
  nikdo nevypadá. `minMatchesPerTeam = maxMatchesPerTeam = počet kol`. `phaseBreaks = 0`.
- `onlineOnly: true` — v `print` režimu se přeskočí (`calcSwiss` se v `print` nevolá a
  generateOptions navíc filtruje `onlineOnly`). **Swiss je tedy vždy interaktivní/online.**
- Data: `swissRounds`. **Swiss je dynamický** — nestaví se přes `buildSchedule`; viz §6.6.

### 6.6 Swiss — interaktivní online tok (klíčová logika)

Párování kola N závisí na výsledcích kol 1..N−1, takže Swiss se **negeneruje dopředu**.
Aplikace drží kola jako zdroj pravdy v `state.swiss` a generuje další kolo na vyžádání.

**Stav `state.swiss`** (pro `swiss` v online režimu; jinak `null`):
```js
{
  teams,        // [...názvy týmů] — fixní seznam pro tabulku
  totalRounds,  // = option.swissRounds (plánovaný počet kol)
  courts,       // počet kurtů (pro přiřazení kurtů zápasům)
  fmtId,        // id formátu zápasu (pro skórování)
  matchSeq,     // čítač id zápasů (od 1, napříč všemi koly)
  rounds: [     // pole vygenerovaných kol
    { matches: [{ id, t1, t2, court }], byeTeam: name|null }
  ]
}
```
`id` zápasu je stabilní integer od 1 (klíč skóre, viz §12). Kurt zápasu = `(i % courts) + 1`.

**Inicializace (`initSwiss`)** při výběru Swiss formátu: vynuluje skóre, vytvoří
`state.swiss` a vygeneruje **kolo 1** (`swissInitialPairing`).

**Párování 1. kola (`swissInitialPairing(teams)`)**: pole se rozdělí napůl a páruje se
horní vs dolní polovina (nasazení 1 vs ⌈n/2⌉+1, …). Lichý počet → poslední nasazený
dostane **bye**. Vrací `{ pairs, byeTeam }`.

**Párování dalšího kola (`swissPairNextRound(standings, history, byeHistory)`)** —
standings je už seřazené nejlepší→nejhorší:
- Lichý počet → bye dostane **nejníže postavený tým, který bye ještě neměl** (fallback:
  kdokoli, když už všichni měli).
- **Backtracking** najde bezrematchové párování, kdykoli existuje: horní tým se páruje
  s nejbližším povoleným soupeřem (Swiss princip) a rekurzivně dál; při zaseknutí se
  vrací zpět. Greedy fallback (povolí rematch) se použije **jen** když bezrematchové
  párování neexistuje. (Pozn.: prosté greedy odshora by občas vynutilo zbytečný rematch.)
- Vrací `{ pairs, byeTeam }`.

**Tabulka (`computeSwissStandings(swiss, scores, fmtId)`)**:
- Body: **1 za výhru**, **bye = výhra (+1 bod)**. Sleduje se V/P/bye/odehráno/rozdíl míčů.
- **Buchholz** = součet bodů soupeřů (po dopočtení bodů všech).
- Řazení (tiebreaky): body desc → Buchholz desc → rozdíl míčů desc → jméno.
- Rozdíl míčů `swissMatchDiff` = součet (skóre t1 − skóre t2) přes zadané sety.

**Generování dalšího kola (`generateNextSwissRound`)**: povoleno jen když je
**aktuální kolo kompletní** (každý zápas má rozhodnutého vítěze) a `rounds.length < totalRounds`.
Spočítá standings, sestaví `history` (všechny odehrané dvojice) a `byeHistory`, zavolá
`swissPairNextRound`, přidá nové kolo, uloží stav a překreslí.

**Konec turnaje**: po vygenerování všech `totalRounds` kol a doplnění výsledků posledního
kola se zobrazí konečné pořadí (medaile 🥇🥈🥉 u prvních tří).

---

## 7. Generování nabídky (`generateOptions(teamNames, courts, startTime, endTime, onlineMode)`)

1. `available` = délka okna v minutách (`(endTime − startTime)/60000`, zaokr.).
2. Pro **každý** formát zápasu × **každý** generátor typu turnaje zavolej `calc(N, C, fmt)`.
3. Zahoď `null`, zahoď `onlineOnly` formáty mimo online režim.
4. **Vejde se do času**, pokud `estimatedMinutes ≤ available × 1.04` (4 % tolerance).
5. Ke každé možnosti přidej `availableMinutes`, `fitnessScore = estimatedMinutes/available`,
   `tournamentName`, `tournamentDesc`, `tournamentType`.
6. **Řazení** (menší skóre = lepší, první karta = „nejlepší shoda"):
   - `fmtBonus` podle `sortPriority`: 1 → +0.12, 2 → +0.08, 3 → +0.04, 5 → −0.20.
   - Cíl je `fitnessScore + fmtBonus ≈ 1` (co nejlepší využití času s preferencí kvalitnějších formátů).
   - **Penalizace**: `fitnessScore < 0.45` → +0.5; nesoulad počtu skupin s počtem
     kurtů → `abs(skupiny − kurty) × 0.08` (chceme 1 skupinu na kurt).
   - Klíč: `abs(fitnessScore + fmtBonus − 1) + penalty`.
7. **Skrytí 1×15**: pokud existuje jakýkoli formát s `sortPriority < 5`, odfiltruj
   všechny `set1_15` (je to opravdu poslední možnost). Jinak je nech.

---

## 8. Pomocné algoritmy

- **`generateRRRounds(n)`** — round-robin rozlosování metodou kroužku (circle method).
  Při lichém `n` přidá fiktivní `-1` (bye). Vrací pole kol, každé kolo = pole dvojic
  `[indexA, indexB]` (indexy do pole týmů).
- **`bracketSeedOrder(B)`** — standardní tenisové pořadí nasazení pro bracket velikosti
  `B` (rekurzivně; nasazené 1 a 2 se potkají nejpozději). Vrací pole čísel nasazení
  pro jednotlivé sloty bracketu.
- **`generateSeedLabels(groupLabels, poolSizes)`** — feeder labely v pořadí nasazení:
  nejdřív všichni „1. ze skupiny X", pak všichni „2.", … Tvar labelu: `` `${rank}. Sk.${label}` ``.
- **`calcKnockoutSlots(teams, courts)`** — počet časových slotů single-elim pavouka
  (s byes pro nemocninu 2 + zápas o 3. místo když `teams ≥ 4`).

---

## 9. Stavba rozpisu (`buildSchedule(option, teamNames, courts, startTime)`)

Vrací pole `schedule` objektů zápasů. `matchId` je **sekvenční integer od 1**
(deterministický → klíče skóre jsou reprodukovatelné, na tom stojí persistence).

### Tvar objektu zápasu
```js
{
  id,            // 1, 2, 3, … (pořadí vytvoření)
  time,          // Date — čas začátku zápasu
  court,         // 1..C
  team1Label,    // jméno týmu NEBO placeholder ('1. Sk.A', 'Vít. P1', 'Vít. M1 sk.A', …)
  team2Label,
  roundName,     // 'Skupiny — kolo 1', 'Semifinále', 'Finále', 'LB 1. kolo', …
  phase,         // 'pool' | 'semifinal' | 'final' | 'bracket' | 'losers'
  koLabel,       // 'P1', 'SF1', 'F1', 'F3', … nebo null
  score1: '', score2: '',  // legacy, nepoužívá se (skóre žije v state.scores)
}
```

### Plánování slotů (`pushSlot(matchPairs, roundName, phase, koLabels)`)
- Začátek prvního zápasu = `startTime + WARMUP_MIN`.
- Zápasy v `matchPairs` se dávkují po `C` (kurtech): každá dávka = jeden časový slot,
  kurty `1..batch.length`. Po dávce `cursor += (duration + TRANSITION)`.
- Před play-off fází (u `pool_knockout`/`modified_pool`) se přičte `PHASE_BREAK`.

### Sestavení per typ
- **round_robin**: kola `rrRounds`, label `Kolo {i+1}`, phase `pool`.
- **pool_knockout**: týmy se rozdělí do skupin podle `poolSizes` (popořadě),
  kola napříč skupinami se spojí (`Skupiny — kolo {r+1}`), pak `PHASE_BREAK`, pak
  `pushKnockout(seedLabels, …)` s nasazením přes `generateSeedLabels`.
- **modified_pool**: nejdřív 4-členné skupiny, pak 3-členné. Kolo 1 = (4-tým: 1v4, 2v3 |
  3-tým: 1. RR zápas). Kolo 2 = (4-tým: vítěz M1 vs vítěz M2 + poražený M1 vs poražený M2,
  pomocí placeholderů `Vít./Por. M1/M2 sk.{label}` | 3-tým: 2. RR zápas). Kolo 3 = jen
  3-členné skupiny (3. RR zápas). Pak `PHASE_BREAK` a `pushKnockout`.
- **double_elimination**: WB 1. kolo (s byes), LB 1. kolo, pak střídavě WB a LB kola
  pomocí placeholderů `WB Vít.{mc}`, `WB Por.{mc}`, `LB: Por.{mc}`, `LB Vít.{mc}`,
  nakonec `LB Finále` a `Grand Finále` (`WB Vítěz` vs `LB Vítěz`).
- **swiss**: `buildSchedule` Swiss **nepoužívá** — Swiss je dynamický a staví se
  interaktivně přes `state.swiss` (viz §6.6). `selectOption` pro `type === 'swiss'`
  volá `initSwiss()` místo `buildSchedule()`.

### Pavouk (`pushKnockout(seedLabels, pushSlot)`)
Single-elim, do kterého **vstupují všechny** seedLabely se standardním nasazením.
- `B = 2^ceil(log2(N))`, `bye = B − N`. Fiktivní nasazení (rank > N) = bye, auto-postup.
- Pokud jsou byes → 1. reálné kolo se jmenuje **„Předkolo"** (phase `semifinal`),
  labely `P1, P2, …`, vítězové = `Vít. P{n}`. Týmy s bye postupují samy.
- Bez byes → 1. kolo je plné (`Osmifinále`/`Čtvrtfinále`/… dle počtu, viz `nameForRound`).
- Další kola: `nameForRound(teamsIn)` → 2 = Finále, 4 = Semifinále, 8 = Čtvrtfinále,
  16 = Osmifinále, 32 = 1/16 finále, jinak `Kolo {log2}`.
- **Zápas o 3. místo**: těsně před Finále, pokud semifinále mělo 2 zápasy
  (`Por. SF 1` vs `Por. SF 2`), `roundName = 'O 3. místo'`, `koLabel = 'F3'`.
- Finále má `koLabel = 'F1'`, phase `final`. Semifinále labely `SF{n}`, vítěz `Vít. SF{n}`.

---

## 10. Tabulka časového rozpisu (`renderScheduleTable`)

Kompaktní mřížka: **řádky = časové sloty, sloupce = kurty** (celý turnaj se typicky
vejde na jednu A4). Hlavička: `Čas | Kolo / Fáze | Kurt 1 | … | Kurt N`.

- Zápasy se seskupí podle času (zachová pořadí rozpisu); prázdný kurt = „—".
- Buňka zápasu: `team1Label × team2Label`.
- **Oddělovač fází**: při přechodu `pool → (semifinal|bracket|losers|final)`,
  `bracket → losers`, `losers → final`, `semifinal → final` se vloží řádek
  `phase-separator` s popiskem (⬇ Losers Bracket / 🏆 Pavouk / 🏆 Vyřazovací část /
  🥇 Finálová část).

---

## 11. Skupinové tabulky (`renderGroupStandings`) — jen pool_knockout & modified_pool

`getGroupTeams(option, teamNames)` rozdělí týmy do skupin (`rr` / `mod4` / `rr3`).
`computeGroupStandings` spočítá pro každou skupinu W/L/D a pořadí (řazení: výhry desc,
prohry asc, jméno).

- **Skupina typu `mod4`** (4 týmy, modifikovaný formát) → **mini-bracket**
  (`renderModMiniBracket`): M1 (1v4) + M2 (2v3) vlevo, M3 (o 1./2.) + M4 (o 3./4.)
  vpravo, dole „pódium" 1.–4. místo (`1{label}`…`4{label}`).
- **Ostatní skupiny** → **křížová tabulka** (cross-table): řádky/sloupce = týmy,
  buňka = skóre vzájemného zápasu (v `online` inputy, v `print` prázdné boxy), plus
  sloupce „Body" a „Pořadí" (jen online, jen u odehraných). Pod tabulkou „Pořadí zápasů".
  Počet setů (1 nebo 3) podle formátu.

### Propagace jmen pavoukem (`buildResolvedNames`)
V online režimu se z výsledků odvodí mapa **placeholder → reálné jméno**:
- Pořadí ve skupině → `1. Sk.X`, `2. Sk.X`, … (jen u odehraných).
- KO vítězové/poražení → `Vít. P1`, `Por. SF1`, … iterativně do fixního bodu (max 8
  iterací), aby se vítězové propsali přes víc kol. Podporuje i legacy varianty `Vít. SF {n}`.

V `print` režimu se skóre nezadává, vše zůstává prázdné (pole pro ruční zápis).

---

## 12. Skórování

### Klíče v `state.scores`
```
`${matchId}_${team}_${setIndex}`   →   string ('' až dvouciferné číslo)
team:     1 nebo 2
setIndex: 0..(setsForFormat−1)   // 1 set → jen 0; 3 sety → 0,1,2 (set1, set2, TB)
```
Validace vstupu: povolené jsou `''` nebo 1–2 číslice (`/^\d{1,2}$/`).

### `matchWinner(scores, matchId, fmtId)` → `0 | 1 | 2`
- 0 = nerozhodnuto/nezadáno, 1 = vyhrál tým 1, 2 = vyhrál tým 2.
- **1 set**: porovná set 0; vyšší vyhrává, shoda → 0.
- **2 sety + TB**: spočítá vyhrané sety (0,1). Při 2:0 nebo 0:2 hotovo; při 1:1
  rozhoduje tiebreak (set index 2). Jakýkoli chybějící potřebný set → 0.

### `matchScoreText(scores, matchId, fmtId)`
Textový souhrn („21:18 19:21 10:8" nebo „21:15"); přeskakuje nevyplněné sety.

---

## 13. Persistence (localStorage)

- Klíč: `tourneymaker.state.v1`. Ukládá se **snapshot vstupů**, ne odvozený rozpis
  (ten obsahuje `Date` objekty, které nepřežijí JSON).
- Snapshot: `{ v:1, step, sport, teams, courts, startTime, endTime, mode, scores,
  selectedOptionIndex, swiss }`. `selectedOptionIndex` = index `selectedOption` v `options`
  (nebo `null`). `swiss` = `state.swiss` (nebo `null`) — **Swiss kola se ukládají
  explicitně**, protože nejsou reprodukovatelná z čistých vstupů (závisí na výsledcích).
- **`saveState()`** se volá při každé mutaci: změna sportu, přejmenování/přidání/odebrání
  týmu, kurty, časy, režim, přechod kroku (`goToStep`), výběr formátu, zadání skóre.
  Selhání (private mode / plno) se tiše ignoruje.
- **`restoreState()`** při načtení stránky: aplikuje vstupy (s validací typů), vykreslí
  krok 1; pokud byl uložen krok 2/3 a vstupy jsou stále validní (`validateStep1(true)`),
  **deterministicky přegeneruje** `options` (`computeOptions`) a pro krok 3 znovu postaví
  rozpis přes `restoreSelectedOption(idx)` — **bez mazání skóre** (na rozdíl od
  `selectOption`, který skóre nuluje). Díky deterministickému `matchId` klíče skóre sedí.
  Guard: když index nevyjde, spadne na krok 2; když se nic nevejde, na krok 1.
  **Swiss** se obnovuje zvlášť: `state.swiss = snap.swiss` (kola se nepřegenerovávají,
  jsou zdrojem pravdy).
- **`resetAll()`** (tlačítko „🗑 Začít načisto"): vymaže storage, vrátí state na výchozí,
  vykreslí krok 1, toast.

---

## 14. Tisk / PDF a kopírování

- **Tisk** (`printSchedule` → `window.print()`): `@page A4 landscape, margin 10mm`.
  V tisku se skryjí hlavička, navigace kroků, tlačítka, legenda (`.no-print`). Každá
  velká sekce na vlastní stránce (skupiny a pavouk `break-before: page`). Barvy pozadí
  se tisknou (`print-color-adjust: exact`).
- **Kopírovat text** (`copyScheduleText`): textový rozpis do schránky — hlavička,
  pak po kolech řádky `HH:MM  Kurt X:  TýmA vs TýmB`. Toast po zkopírování.

---

## 15. Design systém (CSS)

CSS proměnné (`:root`):
```
--blue #1d4ed8  --blue-l #dbeafe  --blue-d #1e3a8a
--sand #f59e0b  --sand-l #fef3c7  --green #059669  --green-l #d1fae5
--red #dc2626   --red-l #fee2e2   --gray #64748b   --gray-l #f1f5f9
--white #ffffff --text #0f172a    --text-m #475569 --border #e2e8f0
--radius 12px   --shadow 0 2px 12px rgba(0,0,0,.08)  --shadow-l 0 4px 24px rgba(0,0,0,.12)
```
- Karty (`.card`) se zaoblením `--radius` a stínem; modrá hlavička rozpisu (`--blue-d`).
- Vítěz zvýrazněn zeleně (`.team-winner`, `--green`, tučně).
- **Responsivita**: `@media (max-width: 640px)` zmenší titulky, 2sloupcový form-grid,
  skryje popisky kroků; `@media (max-width: 560px)` další úpravy.
- Pavouk: horizontální flex sloupce po kolech (`.bracket-view`), v tisku `flex-wrap: nowrap`,
  bez scrollbarů.

---

## 16. Klíčová pravidla a okrajové případy (akceptační kritéria)

1. **Determinismus**: `generateOptions` i `buildSchedule` musí dávat při stejných
   vstupech identický výstup (včetně `matchId`). Na tom stojí persistence skóre.
2. `matchId` je integer od 1, přidělovaný v pořadí vkládání do rozpisu.
3. Formát se nabídne jen pokud `estimatedMinutes ≤ available × 1.04`.
4. `1×15` se skryje, existuje-li lepší formát.
5. `swiss` jen v online režimu; `pool_knockout` jen N ≥ 6; `modified_pool` musí mít
   ≥ 1 čtyřčlennou skupinu; `round_robin` jen 3–5 týmů; `double_elim` jen N ≥ 4.
6. V `print` režimu se skóre nezadává (jen prázdná pole); v `online` se počítá pořadí
   a propagují vítězové pavoukem v reálném čase (`withFocusPreserve` zachová focus
   v inputu při re-renderu).
7. Při změně formátu (`selectOption`) se skóre **vynuluje**; při obnově ze storage
   (`restoreSelectedOption`) se **zachová**.
8. Minimum 3 týmy, minimální délka turnaje 30 min.
9. Inputy skóre přijímají jen prázdno nebo 1–2 číslice.
10. Skóre v pavouku (online) jsou inputy s třídou `.bm-score-inp` a atributem
    `data-key` — handler musí poslouchat na **tomto** selektoru (historicky tu byl bug
    se selektorem `.bm-slash`, kvůli kterému zadávání v pavouku nefungovalo).
11. **Swiss** (§6.6): další kolo lze vygenerovat jen když je aktuální kolo kompletní;
    žádné rematche (pokud se lze vyhnout); každý tým max. jeden bye; bye = výhra (+1 bod);
    `state.swiss` (kola) je zdroj pravdy a ukládá se do `localStorage` (na rozdíl od
    ostatních formátů se NEpřegenerovává z čistých vstupů). Stop po `totalRounds` kolech.

---

## 17. Bootstrap (pořadí při načtení)

`DOMContentLoaded` → navázat event handlery (tlačítka, inputy) → `restoreState()`
(která sama vykreslí krok 1 a případně obnoví krok 2/3). `renderStep1` se tedy volá
uvnitř `restoreState`, ne zvlášť.
