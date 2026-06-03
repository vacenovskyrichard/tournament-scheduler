# 🏆 TourneyMaker

Turnajový plánovač pro plážový volejbal a další sporty (tenis, padel, volejbal, badminton).
Zadáš týmy, počet kurtů a časové okno — aplikace vygeneruje všechny turnajové formáty,
které se do okna vejdou, a vykreslí kompletní časový rozpis, skupinové tabulky a pavouka.

Dva režimy: **Tisk / PDF** (prázdná pole pro ruční zápis) a **Online zápis**
(zadávání výsledků v prohlížeči s automatickým pořadím a propagací vítězů pavoukem).

## 📄 Specifikace

Kompletní funkční a technická specifikace veškeré logiky je v **[SPEC.md](SPEC.md)** —
datový model, všech 5 turnajových formátů s algoritmy, plánovač, pavouk se seedingem,
skórování, persistence i design tokeny.

## 🛠 Technologie

Čistá statika — HTML + CSS + vanilla JavaScript. Žádný build krok, žádné závislosti,
žádný backend.

```
index.html        — kostra UI (3 kroky)
css/style.css     — styling, tisk, responsivita
js/scheduler.js   — jádro: formáty, generování options, plánovač, pavouk, skórování (čisté funkce)
js/app.js         — UI: state, rendering, event handlery, persistence (localStorage)
```

## ▶️ Spuštění lokálně

Stačí naservírovat soubory jakýmkoli statickým serverem, např.:

```bash
python -m http.server 8000
# nebo
npx serve .
```

a otevřít `http://localhost:8000`.

## 🚀 Nasazení

Hostováno na **GitHub Pages** z větve `main` (Deploy from a branch, root, `.nojekyll`):
<https://vacenovskyrichard.github.io/tournament-scheduler/>

## 🌿 Workflow

Vývoj probíhá na větvi **`development`**; do `main` se mergují jen hotové funkční celky
(`main` = produkce nasazená přes GitHub Pages).
