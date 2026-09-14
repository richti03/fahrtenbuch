# Fahrtenbuch

Statische Web-App zum Erfassen von Fahrten, Tankvorgaengen, Kraftstoffkosten und Favoriten.

Die App besteht aus HTML, CSS und modernem Vanilla JavaScript mit ES6-Modulen. Sie kann lokal oder ueber statisches Hosting wie GitHub Pages betrieben werden. Die geraeteuebergreifende Synchronisierung erfolgt ueber Supabase.

## Funktionen

- Dashboard mit Zeitraumfilter, standardmaessig letzte 30 Tage
- Kennzahlen fuer den gewaehlten Zeitraum
- Diagramme pro Fahrt mit lesbaren Datumslabels
- Fahrtenverwaltung mit Start, Ziel, Zwischenzielen, Kilometer, Verbrauch, Notizen und Ordnungsfaktor
- Automatische sichtbare Fahrtbezeichnung aus Datum und Ordnungsfaktor, z. B. `Mo., 14.09.2026 (1)`
- Automatische Notiz fuer Zwischenziele, optisch kleiner/grau/kursiv und beim Bearbeiten ausgeblendet
- Tankverwaltung mit Tankstelle, Liter, Preis pro Liter, Gesamtpreis und Notizen
- Tankdetailansicht mit Verbrauchsstatus und Liste der Fahrten, die diesen Kraftstoff verbraucht haben
- Navigation zwischen Tankdetail und Fahrtdetail
- FIFO-Kostenberechnung ueber alle Fahrten und Tankvorgaenge
- Warnung, wenn rechnerisch nicht genuegend Kraftstoff erfasst wurde
- getrennte Favoriten fuer Adressen und Tankstellen
- Dark Mode als Standard
- JSON-Export als Backup

## Projektstruktur

```text
/
|-- index.html
|-- css/
|   `-- style.css
|-- js/
|   |-- app.js
|   |-- dashboard.js
|   |-- fahrten.js
|   |-- favorites.js
|   |-- fifo.js
|   |-- storage.js
|   |-- supabase-config.js
|   |-- supabase-sync.js
|   `-- tanken.js
|-- data/
|   `-- beispiel-daten.json
|-- tests/
|   `-- fifo.test.mjs
`-- tools/
    `-- dev-server.mjs
```

## Starten

Mit Python:

```bash
python -m http.server
```

Danach:

```text
http://localhost:8000
```

Alternativ mit Node:

```bash
node tools/dev-server.mjs 8000
```

Danach:

```text
http://127.0.0.1:8000
```

## Supabase

Die App nutzt Supabase Auth mit E-Mail und Passwort. Nach dem Login werden Daten aus Supabase geladen und nach jeder Aenderung wieder gespeichert.

Die Konfiguration steht in:

```text
js/supabase-config.js
```

Aktuell verwendet:

```js
export const SUPABASE_URL = "https://xkkgqxpocyitikkjjnry.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_...";
```

Nur der publishable key darf im Frontend stehen. Kein `service_role` Key im Browser verwenden.

## Supabase Tabellen

### fahrten

Erwartete Spalten:

```text
id uuid primary key default gen_random_uuid()
user_id uuid not null references auth.users(id) on delete cascade
datum date not null
ordnungsfaktor integer not null default 1
start text
ziel text
zwischenziele jsonb
kilometer numeric
verbrauch_pro_100km numeric
notizen text
created_at timestamptz
```

### tankvorgaenge

Erwartete Spalten:

```text
user_id uuid not null references auth.users(id) on delete cascade
datum timestamptz not null
liter numeric
preis_pro_liter numeric
created_at timestamptz
tankstelle text
```

Hinweis: Die App erzeugt lokale Tank-IDs aus Datum und Tagesindex. Fuer dauerhaft robuste Bearbeitung ueber mehrere Geraete waere eine eigene `id uuid`-Spalte sinnvoll.

### favoritenAdressen

Erwartete Spalten:

```text
user_id uuid not null references auth.users(id) on delete cascade
name text
created_at timestamptz
adresse text
```

### favoritenTankstelle

Erwartete Spalten:

```text
user_id uuid not null references auth.users(id) on delete cascade
name text
created_at timestamptz
marke text
adresse text
```

## Supabase SQL Setup

UUID-Default fuer `fahrten.id`:

```sql
create extension if not exists pgcrypto;

alter table public.fahrten
alter column id set default gen_random_uuid();

alter table public.fahrten
add column if not exists ordnungsfaktor integer not null default 1;
```

RLS und Rechte fuer benutzerbezogene Tabellen:

```sql
alter table public.fahrten enable row level security;
alter table public.tankvorgaenge enable row level security;
alter table public."favoritenAdressen" enable row level security;
alter table public."favoritenTankstelle" enable row level security;

grant select, insert, update, delete on public.fahrten to authenticated;
grant select, insert, update, delete on public.tankvorgaenge to authenticated;
grant select, insert, update, delete on public."favoritenAdressen" to authenticated;
grant select, insert, update, delete on public."favoritenTankstelle" to authenticated;
```

Policies fuer `fahrten`:

```sql
drop policy if exists "Users can read their own fahrten" on public.fahrten;
drop policy if exists "Users can insert their own fahrten" on public.fahrten;
drop policy if exists "Users can update their own fahrten" on public.fahrten;
drop policy if exists "Users can delete their own fahrten" on public.fahrten;

create policy "Users can read their own fahrten"
on public.fahrten for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own fahrten"
on public.fahrten for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own fahrten"
on public.fahrten for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own fahrten"
on public.fahrten for delete to authenticated
using ((select auth.uid()) = user_id);
```

Die gleichen Policies werden fuer `tankvorgaenge`, `"favoritenAdressen"` und `"favoritenTankstelle"` benoetigt, jeweils mit dem passenden Tabellennamen.

## Datenhaltung

Die Fahrtenbuch-Daten werden nicht mehr im `localStorage` gecacht. `storage.js` validiert und berechnet Daten im Arbeitsspeicher. Supabase ist die primaere persistente Datenquelle. Supabase Auth kann weiterhin eine Browser-Session speichern; das ist kein Fahrtenbuch-Datencache.

Der JSON-Export bleibt als manuelles Backup verfuegbar.

## FIFO-Berechnung

Die FIFO-Logik liegt in:

```text
js/fifo.js
```

Die Berechnung verarbeitet Tankvorgaenge und Fahrten chronologisch nach Datum und internem Index/Ordnungsfaktor. Nach jeder Aenderung wird der komplette Verlauf neu berechnet.

Fuer jede Fahrt werden berechnet:

- verbrauchte Liter
- Kosten nach FIFO
- FIFO-Anteile je Tankvorgang
- nicht zuordenbare Liter bei fehlendem Kraftstoff

Fuer jeden Tankvorgang werden berechnet:

- Gesamtpreis
- bereits verbrauchte Liter
- verbrauchende Fahrten

## Tests

FIFO-Tests ausfuehren:

```bash
node tests/fifo.test.mjs
```

Abgedeckte Faelle:

- Verbrauch innerhalb einer Tankfuellung
- Verbrauch ueber mehrere Tankfuellungen
- nachtraeglich eingefuegte/geaenderte Fahrten
- geaenderte/geloeschte Tankvorgaenge
- fehlender Kraftstoff
- exakter Verbrauch eines Tankrests

Syntaxpruefung:

```bash
node --check js/app.js
node --check js/supabase-sync.js
node --check js/fifo.js
```
