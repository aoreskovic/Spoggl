# SP Toggl Tracker — Plugin Spec

## Kontekst & cilj

Super Productivity (Electron) plugin koji zamjenjuje defaultni workflow logiranja vremena s Toggl-like sučeljem.

Ključni problem koji rješava:
- SP šalje worklog na Jiru tek kad se task označi kao "done" — što za trajne taskove (npr. `Meetings`) nikad ne dolazi
- Nema pregleda po danu niti bulk-submit logike
- Status-change popup iskače svaki put kad se pokrene timer

---

## Arhitektura plugina

### Tip plugina
`iFrame: true` + `plugin.js` (hybrid)

- **`plugin.js`** — registracija shortcuts, header button, hooking `CURRENT_TASK_CHANGE` i `ACTION` hookovi za intercept idle-time eventa, background perzistencija
- **`index.html`** — kompletan UI (self-contained, sve inline)

### Permissions
```json
["getTasks", "updateTask", "getAllProjects", "getAppState"]
```

### Hooks
```json
["currentTaskChange", "action", "persistedDataChanged"]
```

---

## Modul 1 — Today Panel (Toggl-like UI)

### 1.1 Omnibar tracker

Fiksni header panel s:
- **Task naziv** + Jira ID (editable dropdown/search za promjenu aktivnog taska)
- **Live timer** (HH:MM:SS, kuca dok timer radi)
- **Start time field** — klikabilno polje (format `HH:MM`), ručno editabilno u bilo koje vrijeme
  - Promjena start timea automatski preračunava trajanje (`now - new_start`)
  - Ne smije biti u budućnosti
- **Start / Stop button** (toggle)

### 1.2 Timeline View (dnevni pregled)

Lista svih time entrija za odabrani dan, kronološki (najnoviji gore).

Svaki entry prikazuje:
- Task naziv + Jira ID (klikabilno → otvori task u SP)
- Start i end time (inline editable, format `HH:MM`)
- Trajanje (inline editable, format `Xh Ym`)
- Status badge: `pending` / `synced` / `error`
- Akcije: `▶ restart`, `🗑 delete`

Inline edit pravila:
- Klik na start/end/trajanje → inline input, blur ili Enter potvrđuje
- Promjena start/end automatski rekalkulira trajanje i obrnuto
- Preklapanje entrija nije dozvoljeno — prikaži validation error inline

### 1.3 Day Picker

Na vrhu panela:
```
[ < ]  [ Pon, 09.06.2025 ]  [ > ]  [ Danas ]
```
- Navigacija po danima
- "Danas" gumb teleportira na tekući dan
- Za prošle dane — "Finish Day" je zamijenjen s "Re-sync Day" (pošalje samo unsynced entrije)
- Timer je moguć samo na tekućem danu

### 1.4 Total Time indikator

Jasno vidljivi brojač u headeru Today panela:

```
Total: 6h 30m
```

Dinamički se ažurira:
- Dok timer kuca (svake sekunde)
- Nakon svakog inline edita
- Nakon brisanja entrija

---

## Modul 2 — Workflow & Jira integracija

### 2.1 Finish Day — bulk submit

**Ponašanje pri Stop:**
- Timer staje, entry se sprema lokalno kao `pending`
- Ništa se ne šalje na Jiru

**Finish Day gumb:**
- Istaknut CTA gumb (primarni stil) na vrhu/dnu Today panela
- Sekvencionalni `POST` prema Jira API za svaki `pending` entry tog dana
- Per-entry feedback:
  - ✅ `synced` — zeleni badge
  - ❌ `error` — crveni badge + tooltip s error porukom
- Ako **bilo koji entry** failsa → **sve ostaje u stanju u kakvom jest** (synced ostaju synced, failed ostaju `error`)
- Nakon faila prikaži error summary s listom failanih entrija i "Retry failed" gumb
- Nema auto-retryja

**Jira worklog API poziv po entriju:**
```
POST /rest/api/2/issue/{issueId}/worklog
{
  "started": "<ISO timestamp>",
  "timeSpentSeconds": <int>
}
```

### 2.2 Status-change popup supresija

**Defaultni SP behaviour koji se mijenja:**
- SP nativno otvara dialog za promjenu statusa taska kad se pokrene timer
- Plugin intercepta `CURRENT_TASK_CHANGE` i `ACTION` hookove kako bi suprimirao taj popup
  - Implementacijski detalj: pratiti je li pokretanje timera došlo iz plugin UI-ja, te u tom slučaju ne dispatch-ati `setCurrentTask` action koji triggera SP-ov status dialog

**Novi UX za promjenu statusa:**
- Unutar plugin UI-ja, kad se task aktivira (timer pokrenut), odmah ispod task naziva u Omnibar sekciji prikaži:

```
Set task status: [Do not change ▾]
```

Dropdown opcije se dinamički dohvaćaju ovisno o projektu/boardu taska (via `getAppState()`). Default je uvijek "Do not change". Odabir odmah šalje status update na Jiru.

### 2.3 Merge logika za uzastopne entrije

**Trigger:** novi entry se dodaje za task koji već ima entry(je) danas.

**Pravila:**
1. Pauza između zadnjeg entrija i novog ≤ 30 min → **automatski spoji** u jedan entry (start = najraniji start, end = trenutni end)
2. Pauza > 30 min → **prikaži merge dialog:**

```
⚡ "Meetings" već ima {X} logova danas.
   Ukupno: Xh Ym | Raspon: 09:00 – 14:45

   [ Spoji u jedan log ]   [ Zadrži odvojeno ]
```

- "Spoji u jedan log" → start = prvi start, end = zadnji end (uključuje praznine u rasponu)
- "Zadrži odvojeno" → dodaje kao novi zaseban entry

Merge je uvijek lokalan i ne mijenja ništa na Jiri dok se ne klikne "Finish Day".

---

## Modul 3 — Pinned taskovi & perzistencija

### 3.1 Pinned (Quick Access) taskovi

Horizontalna traka odmah ispod Omnibara s max 6 pinned taskova.

- Klik na pin → gasi aktivni timer, pokreće timer na pinned tasku (s merge logikom iz 2.3)
- Dodavanje: desni klik na task u SP-u → "Pin to Tracker" (ovo zahtijeva plugin.js + `registerMenuEntry` ili context menu hook ako dostupan)
- Alternativno: u plugin UI-ju search + "Pin" gumb
- Uklanjanje: desni klik na pin → "Unpin"
- Pinovi se čuvaju u `persistDataSynced` pod ključem `pinned-tasks`
- Vizualni stil: compact chip s task kodom (npr. `MTG`, `ADM`)

### 3.2 Lokalni backup (crash recovery)

Svi time entriji se zapisuju u `persistDataSynced` pod ključem `daily-log-{YYYY-MM-DD}`.

Učestalost snimanja:
- Na svaki Stop
- Na svaki inline edit (s debounce od 500ms)
- Na svaku merge operaciju

Format pohrane:
```json
{
  "date": "2025-06-09",
  "entries": [
    {
      "id": "uuid",
      "taskId": "SP-task-id",
      "jiraId": "PROJ-123",
      "title": "Meetings",
      "startTs": 1749456000000,
      "endTs": 1749459600000,
      "status": "pending" | "synced" | "error",
      "errorMsg": null
    }
  ]
}
```

Na inicijalizaciju plugina uvijek učitaj today's log iz persistedData.

### 3.3 Idle detection integracija

SP-ov native idle dialog se **zadržava** bez izmjena.

Jedina izmjena: nakon što korisnik odabere što učiniti s idle vremenom u SP-ovom dialogu, rezultat (dodano/odbačeno/redistribuirano vrijeme) se upisuje u lokalni dnevni log kao modifikacija relevantnog entrija — **ne šalje odmah na Jiru**.

Implementacijski: listen na `ACTION` hook, filtriraj `IDLE_TIME_ADDED_TO_TASK` ili ekvivalentni SP action, pa updateaj lokalni entry.

---

## Tehnički constrainti (SP plugin API)

- Iframe ne može koristiti `localStorage` — **isključivo** `persistDataSynced` / `loadSyncedData`
- Registration metode (`registerHeaderButton`, `registerShortcut`, `registerMenuEntry`) **moraju biti u `plugin.js`**, ne u iframe-u
- Iframe komunicira s hostom isključivo kroz `PluginAPI` postMessage bridge
- Sav CSS i JS mora biti **inline** u `index.html` — nema eksternih fajlova
- Za Jira API pozive koristi SP-ovu konfiguriranu Jira integraciju via `getAppState()` za dohvat Jira base URL i auth tokena, ili delegate na SP-ov existing worklog mehanizam ako je izložen kroz API

---

## UI/UX principi

- Koristi SP CSS varijable: `var(--c-primary)`, `var(--bg)`, `var(--card-bg)`, `var(--text-color)`, itd.
- Dark/light theme auto-inherit kroz CSS varijable
- Svi gumbi koriste SP UI Kit klase: `btn-primary`, `btn-outline`, default `button`
- Kartice: `<div class="card">` za Today panel sekcije
- Animacije: `var(--transition-standard)` za sve hover/focus tranzicije
- Error stanja: `var(--c-warn)` boja, nikad modal — inline ili snack

---

## Što se ne mjenja (outside scope)

- SP-ov task management (kreiranje, uređivanje, brisanje taskova)
- SP-ova Jira sync za task metapodatke (status, assignee, itd.) — samo worklog POST je plugin-owned
- SP-ova idle detection logika — plugin samo konzumira rezultat
- Multi-user / multi-account podrška

---

## Open tehničke nepoznanice (za istraživanje pri implementaciji)

1. **Jira worklog endpoint** — Je li dostupan direktno iz iframe-a kroz SP-ovu konfiguriranu auth, ili treba proxy kroz `plugin.js` → `executeNodeScript`?
2. **Status-change popup intercept** — Koji točno Redux action triggera SP-ov status dialog? Potrebno je inspektirati SP izvorni kod ili testirati s `ACTION` hookom.
3. **Context menu za pinning** — SP API ne dokumentira context menu hook. Alternativa je search-based pinning unutar plugin UI-ja.
4. **`persistDataSynced` size limit** — Provjeri koliko dnevnih logova može stati bez problema (posebno za timove s puno entrija po danu — ovdje nije relevantno jer je solo use).
