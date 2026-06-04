# CLAUDE.md — pracovní kontext projektu TourneyMaker

> Tento soubor čte Claude Code automaticky na začátku sezení. Drží **stav prací,
> workflow, nasazení a zvláštnosti prostředí**. Kompletní **logika aplikace** je v
> [SPEC.md](SPEC.md) (zdroj pravdy pro chování); uživatelský přehled v [README.md](README.md).

## Co to je

**TourneyMaker** — turnajový plánovač (plážový volejbal a další sporty). Čistá statika:
HTML + CSS + vanilla JS, **žádný build, žádné závislosti, žádný backend**.

```
index.html        — kostra UI (3 kroky)
css/style.css     — styling, tisk, responsivita
js/scheduler.js   — jádro: formáty, generování options, plánovač, pavouk, skórování (čisté funkce, bez DOM)
js/app.js         — UI: state, rendering, event handlery, persistence (localStorage)
SPEC.md           — kompletní specifikace logiky
```

## Git workflow ⚠️ DŮLEŽITÉ

- Vyvíjí se na větvi **`development`**. Do **`main`** se mergují **jen hotové, ověřené
  funkční celky** — `main` = produkce nasazená přes GitHub Pages (každý push na main jde
  rovnou na živý web).
- Default: commituj na `development`. Na `main` jen na explicitní pokyn / po ověření.
- Commit messages končí `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Nasazení

- **GitHub Pages** z větve `main` (Deploy from a branch, root, `.nojekyll`):
  <https://vacenovskyrichard.github.io/tournament-scheduler/>
- Repo: `git@github.com:vacenovskyrichard/tournament-scheduler.git`

## Zvláštnosti prostředí (tento stroj, Windows)

- **Node JE k dispozici**, ale **není v PATH**: `C:\Program Files\nodejs\node.exe`.
  Volej plnou cestou. Použij na syntax check (`node --check file.js`) a na testy čistých
  funkcí: `scheduler.js` nemá DOM, dá se načíst přes `vm` (`vm.createContext` +
  `vm.runInContext`) a volat funkce z test harnessu (takhle byl ověřen Swiss engine).
- **Python NEběží** — je to jen Microsoft Store zástupce (stub).
- **Live preview v prohlížeči tu nejde rozjet**: preview MCP chce `launch.json` v
  `C:\WINDOWS\system32\.claude`, kam nelze zapisovat (EPERM). Statický server přes python
  taky nejde. → **Ověřuj logiku přes Node**; vizuální/DOM chování ověřuje uživatel ručně
  v prohlížeči.
- Lokální spuštění pro uživatele: jakýkoli statický server (`npx serve .`) + otevřít v prohlížeči.

## Stav prací (k 2026-06-04)

`main` (= produkce, nasazeno):
1. **Persistence do localStorage** — ukládá vstupy + skóre + krok + vybraný formát; po
   refreshi obnoví stav (rozpis se deterministicky přegeneruje). Tlačítko „Začít načisto".
   (Při tom opraven bug: skóre v pavouku se kvůli špatnému selektoru neukládalo.)
2. `.nojekyll` pro GitHub Pages.

`development` (3 commity před `main`, **zatím NEmergováno do main**, čeká na ověření v prohlížeči):
3. **SPEC.md + README.md** — kompletní specifikace logiky + odkaz z README.
4. **Interaktivní online Swiss systém** — předtím vůbec nefungoval (jen placeholdery).
   Teď: párování 1. kola (nasazení), párování dalších kol **backtrackingem** (bez
   rematchů, ≤1 bye/tým), tabulka s body/Buchholz/rozdílem, generování dalšího kola z
   živých výsledků, konečné pořadí s medailemi. Stav v `state.swiss`, persistuje se
   explicitně. **Engine ověřen automatickým testem přes Node** (5/6/7/8 týmů, 3–4 kola).
   Detaily v SPEC §6.6.
5. **Sjednocení polí pro skóre** — předtím malá `type="number"` (spinnery) + překreslení
   při každém stisku (kradlo focus). Teď: jedna třída `.score-inp`
   (`type="text" inputmode="numeric" maxlength="2"`, ~42×38px, bez spinnerů), obsluha
   **delegací na `#step3`** (`input` = jen uložit, `change` = překreslit). SPEC §16 body 6, 10.

## Další kroky / co je otevřené

- [ ] **Ověřit `development` v prohlížeči** (hlavně online Swiss tok + zadávání skóre na
      mobilu) — logika je otestovaná Nodem, ale DOM/UI ne.
- [ ] Po ověření **mergnout `development` → `main`** (Swiss + SPEC/README + score inputs
      najednou) → nasadí se na živý web.
- [ ] (Drobnost) Git identita commitů je auto-odhadnutá `Richard Vacenovský
      <vacenovsky.ric@elem6.com>`. Pokud má být jiná, nastavit `git config`.
- [ ] (Známý kompromis) Po `change` překreslení se ztratí focus při Tabování mezi poli
      skóre; kliknutí/ťuknutí funguje. Lze doladit, je-li potřeba plynulý Tab.

## Konvence pro práci na tomto projektu

- Měníš-li logiku, **aktualizuj zároveň `SPEC.md`** (drž ho v souladu s kódem).
- Po změně JS: `"/c/Program Files/nodejs/node.exe" --check js/app.js js/scheduler.js`
  (nebo každý zvlášť), u čisté logiky doplň `vm` test.
- Nové větší featury = vlastní commit(y) na `development`.
