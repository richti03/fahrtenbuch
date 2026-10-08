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

Die Berechnung verarbeitet Tankvorgaenge und Fahrten chronologisch nach Datum und gespeicherter Berechnungsposition innerhalb des Tages. Nach jeder Aenderung wird der komplette Verlauf neu berechnet.

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

## Fahrtsimulation

Im Reiter **Simulation** die gesamte geplante Entfernung in Kilometern eingeben.
Die App zeigt den geschätzten Verbrauch in l/100 km, die benötigten Liter und die
Kraftstoffkosten. Es wird ein Fahrzeug pro Datenbestand angenommen. Simulationen
werden nicht gespeichert und verändern weder Fahrten noch Tankbestand.

Die Prognose berücksichtigt alle gültigen bisherigen Fahrten bis einschließlich
heute, unabhängig von den Anzeige- und Zeitraumfiltern. Ähnlich lange und neuere
Fahrten erhalten mehr Gewicht:

```text
Längengewicht = 1 / (1 + log2(bisherige Kilometer / geplante Kilometer)²)
Zeitgewicht  = 0,5 ^ (Alter in Tagen / 180)
Gewicht      = Längengewicht × Zeitgewicht
Verbrauch    = Summe(Gewicht × Verbrauch pro 100 km) / Summe(Gewicht)
Liter        = geplante Kilometer × Verbrauch / 100
```

Die Implementierung normalisiert die Zeitgewichte auf die neueste gültige Fahrt;
das ändert den gewichteten Mittelwert nicht und vermeidet numerischen Unterlauf
bei alten Daten. Ungültige, nicht positive und zukünftige Fahrteinträge werden
nicht berücksichtigt. Unter fünf gültigen Fahrten erscheint ein Datenhinweis;
unter drei Fahrten zwischen halber und doppelter geplanter Entfernung zusätzlich
ein Hinweis auf wenig ähnliche Fahrten. Ohne Historie ist ein manueller Verbrauch
nötig. Ein optionaler manueller Verbrauch ersetzt ansonsten die Prognose.

Die Gewichtung ist eine heuristische Schätzung, keine validierte Vorhersage.
Verkehr, Geschwindigkeit, Wetter und Straßenart werden nicht berücksichtigt.

Vorhandener Kraftstoff wird aus den FIFO-Restschichten mit seinen Kaufpreisen
bewertet. Fehlende Liter werden separat zum letzten gültigen bisherigen Tankpreis
oder zum eingegebenen Nachkaufpreis geschätzt. Ohne Nachkaufpreis bleiben die
Gesamtkosten offen; bekannte Teilkosten und Fehlmenge bleiben sichtbar. Der Button
„Letzten Tankpreis übernehmen“ setzt einen manuell geänderten Nachkaufpreis zurück.
Ein unvollständig erfasster Kraftstoffbestand wird als Einschränkung angezeigt.
Die Berechnung verwendet intern ungerundete Werte; Ergebnisse werden auf zwei
Nachkommastellen angezeigt. Die Kosten umfassen ausschließlich Kraftstoff.

Die Berechnung und Oberfläche liegen in `js/simulation.js`. Tests ausführen:

```bash
node tests/simulation.test.mjs
```

## Volltankabgleich und Supabase-Migration

Für Volltankabgleiche im Supabase SQL Editor den Inhalt von
`migrations/20261007_volltankabgleich.sql` ausführen. Die Migration ergänzt nur
Spalten und lässt sich wiederholt ausführen; bestehende RLS-Regeln bleiben gültig.

Im Tankformular „Vollgetankt – Bestand abgleichen“ aktivieren. Der Zielbestand
wird aus dem eingestellten Tankvolumen vorbelegt und pro Tankvorgang gespeichert.
Die Berechnung erfolgt nach Datum und gespeicherter Tagesposition. Neue Tankungen
folgen auf alle bereits erfassten Ereignisse desselben Tages. Damit werden alle
bisher erfassten Fahrten bis einschließlich des Tanktags berücksichtigt. Später
erfasste Fahrten desselben Tages und spätere Kalendertage folgen danach.
Die sichtbaren Ordnungsfaktoren sind unabhängig von der Berechnungsposition.
Spätere Änderungen des allgemeinen Tankvolumens ändern frühere Zielbestände nicht.

Fehlender Bestand wird als zusätzliche FIFO-Schicht zum mengengewichteten
Durchschnittspreis der Restbestände nach der tatsächlichen Tankung ergänzt.
Der Preis wird intern nicht auf Cent gerundet. Überschüssiger Bestand wird aus den
ältesten FIFO-Schichten entnommen und als automatische Korrekturfahrt gespeichert.
Korrekturen tragen den Tag `[Bestandskorrektur]` und sind optisch hervorgehoben.
Sie werden über den Tankvorgang verwaltet, bei Änderungen neu berechnet und beim
Löschen der zugehörigen Tankung entfernt.

Korrekturfahrten sind aus allen Dashboard-Kennzahlen, Diagrammen und der
Verbrauchsprognose ausgeschlossen. Zusätzliche Bestandsschichten zählen nicht als
Tankausgaben; echte Fahrten, die diese Schichten verbrauchen, erhalten deren Kosten.
Tankdetails trennen tatsächliche Tankmenge, Korrektur und korrigierten Restbestand.
Tanknotizen und stabile Kennungen werden ebenfalls synchronisiert. Bestehende Daten
ohne Volltankkennzeichnung werden nicht rückwirkend abgeglichen.

Die bestehende Synchronisierung ersetzt die Benutzerzeilen tabellenweise und ist
nicht transaktional. Die Zuordnung verwendet deshalb eine stabile logische
Tankkennung ohne neuen Fremdschlüssel.

Zusätzliche Tests: `node tests/volltank.test.mjs`.

### Migration der Berechnungsreihenfolge

Zusätzlich `migrations/20261007_berechnungsposition.sql` im Supabase SQL Editor
vor Verwendung von Volltankabgleichen ausführen. Beide Migrationen sind für eine neue
Installation nötig. Die Tagesposition wird für Fahrten und Tankungen synchronisiert
und im JSON-Export gespeichert. Bearbeitungen erhalten die Position; ein Datumswechsel
ordnet den Eintrag am neuen Tag hinten ein. Neue Fahrten werden ebenfalls hinten
angefügt, unabhängig vom sichtbaren Ordnungsfaktor.

Alte Einträge ohne Position übernehmen zunächst die bisherige Tagesreihenfolge;
Volltankungen ohne Position werden hinter die übrigen Ereignisse desselben Tages
verschoben, untereinander in bisheriger Tankreihenfolge. Bestehende automatische
Korrekturen werden neu berechnet. Die Positionen werden beim nächsten regulären
Speichern nach Supabase übertragen. Bereits gespeicherte Positionen bleiben stabil.

Regressionstests zur Tagesreihenfolge: `node tests/berechnungsposition.test.mjs`.

### Kompatibilität mit älteren Supabase-Tabellen

Normale Fahrten und Tankungen bleiben ohne die neuen Migrationen speicherbar.
Die App prüft die optionalen Spalten durch lesende Abfragen und sendet nur
unterstützte Erweiterungsfelder. Vor jeder Speicherung werden außerdem die
Payload-Spalten aller vier Tabellen geprüft, bevor die erste Zeile gelöscht wird.
Netzwerk- oder Berechtigungsfehler brechen die Speicherung ab.

Volltankabgleiche sind im Formular bis zur erfolgreichen Schema-Prüfung gesperrt.
Enthält der Datenbestand Volltankungen oder Korrekturfahrten, wird bei fehlenden
Erweiterungen die gesamte Speicherung vor jeder Löschung abgebrochen. Beide
Migrationen werden benötigt; ein Volltankabgleich wird nicht verlustbehaftet in
normale Einträge umgewandelt. Ohne gespeicherte Tagespositionen gilt nach erneutem
Laden die alte Tagesreihenfolge. Nach Migration erneut anmelden oder eine reguläre
Speicherung auslösen, um die Schema-Prüfung zu aktualisieren.

Anmeldung und Laden speichern nicht automatisch. Bei Synchronisierungsfehlern
bleiben die sichtbaren Daten im Speicher und können über JSON exportiert werden.
Vor Neuladen oder Abmelden zuerst exportieren. Eine nachträgliche Migration stellt
bereits gelöschte Daten nicht wieder her; noch im Speicher vorhandene Daten können
nach der Migration durch eine reguläre Speicherung erneut übertragen werden.
Die Speicherung bleibt tabellenweise und nicht transaktional: Die Schema-Prüfung
verhindert Löschungen wegen vorher erkennbarer fehlender Spalten, verhindert aber
keine späteren Netzwerk-, Constraint- oder Schreibberechtigungsfehler.

Tests für Schema-Kompatibilität: `node tests/supabase-schema.test.mjs`.

### Korrekturzeilen und Zustimmung

Positive Bestandskorrekturen erscheinen als eigene, hervorgehobene Zeilen und
mobile Karten unter Tanken. Die tatsächliche Tankung bleibt eine separate Zeile.
Negative Korrekturen erscheinen als eigene Korrekturfahrten. Korrekturzeilen zählen
weiterhin nicht zu den Dashboard-Statistiken.

Vor dem Anlegen oder Ändern einer Korrektur öffnet sich eine Übersicht mit
Tankvorgang, berechnetem Bestand, Zielbestand, Literdifferenz und Bewertung.
„Korrekturen übernehmen“ bestätigt die Änderung. „Tankung ohne Abgleich speichern“
übernimmt nur die tatsächliche Tankung; „Abbrechen“ oder Escape verwirft die
Änderung. Beim Abbrechen einer Tankung bleiben die Eingaben im Formular erhalten.
Auch Änderungen und Entfernungen von Korrekturen durch historische Änderungen
werden vor dem Speichern geprüft. Bereits bestätigte Volltankabgleiche werden
beim Laden aus den gespeicherten Daten wiederhergestellt.

Für diese Darstellung und Zustimmung sind keine zusätzlichen Supabase-Spalten
nötig. Positive Zeilen werden aus dem bestätigten Volltankvorgang abgeleitet;
negative Korrekturfahrten werden weiterhin in fahrten gespeichert.

Tests: `node tests/correction-review.test.mjs`.

### Korrekturdetails und Fehlbestandsausgleich

Eine positive Volltankkorrektur steht in Tabelle und Mobilansicht oberhalb des
Haupttankvorgangs. Ihr eigener Detaildialog zeigt Menge, Bewertung, Verbrauch und
Restbestand. Bearbeitung ist ausschließlich über den verlinkten Haupttankvorgang
möglich.

Für Korrekturtankungen bei Fahrten zusätzlich `migrations/20261008_fehlbestand.sql`
ausführen. Die neue optionale Fahrtspalte `fehlbestand_ausgleichen` erhält die
Zustimmung zum Ausgleich. Auch die Berechnungspositionen müssen vorhanden sein.
Normale Fahrten bleiben mit älteren Schemas speicherbar; bestätigte Ausgleichsfahrten
werden bei fehlenden Spalten vor jeder Löschung blockiert.

Überschreitet eine neue oder bearbeitete Fahrt den verfügbaren Bestand, zeigt die
Vorschau eine Korrekturtankung über die fehlenden Liter zum letzten tatsächlichen
Tankpreis in der Berechnungsreihenfolge. Nach Zustimmung wird diese unmittelbar
vor der Fahrt ergänzt und durch die Fahrt vollständig verbraucht. Die synthetische
Tankung erscheint als eigene Zeile unter Tanken, ohne die tatsächlichen Tankausgaben
oder getankten Liter im Dashboard zu erhöhen. Ihre Kosten gehen in die echte Fahrt
ein. Die Detailansicht verlinkt den Fahrteintrag; Änderungen erfolgen über die Fahrt.

„Fahrt ohne Ausgleich speichern“ erhält die Fehlbestandswarnung. Ohne früheren
Tankpreis oder passende Migration wird nur gewarnt und kein bewerteter Ausgleich
angelegt. Bestehende Fahrten werden nicht rückwirkend automatisch ausgeglichen.
Bei Änderungen und Löschung einer bestätigten Fahrt wird ihre abgeleitete Tankung
aktualisiert beziehungsweise entfernt; die Änderungen erscheinen in der Vorschau.
Tests: `node tests/fehlbestand.test.mjs`.
