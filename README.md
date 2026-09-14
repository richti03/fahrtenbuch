# fahrtenbuch

Erstelle mir eine vollständig statische Webseite als persönlichen Fahrten- und Tank-Tracker für mein Auto.

Die Anwendung soll ausschließlich aus HTML, CSS und JavaScript bestehen und ohne Backend funktionieren. Sie soll lokal oder beispielsweise über GitHub Pages betrieben werden können.

# 1. Bereiche der Anwendung

Die Anwendung soll folgende Bereiche besitzen:

* Dashboard
* Fahrten
* Tanken
* Favorisierte Adressen
* Einstellungen / Datenverwaltung

Das Design soll modern, übersichtlich und responsive sein und auf Desktop, Tablet und Smartphone funktionieren.

# 2. Datenspeicherung

Alle Daten sollen in einer zentralen JSON-Datenstruktur verwaltet werden.

Da die Anwendung statisch ist, soll folgende Speicherstrategie verwendet werden:

* Primäre Speicherung im localStorage des Browsers
* Export aller Daten als JSON-Datei
* Import einer vorhandenen JSON-Datei
* Möglichkeit, ein vollständiges Backup herunterzuladen
* Optional: Unterstützung der File System Access API, um eine lokale JSON-Datei direkt zu öffnen und wieder zu speichern

Die Anwendung darf kein Backend benötigen.

Beispiel:

```json
{
  "fahrten": [],
  "tankvorgaenge": [],
  "favoriten": [],
  "einstellungen": {
    "tankvolumen": 80,
    "waehrung": "EUR"
  }
}
```

# 3. Fahrten

Es soll eine Tabelle mit allen erfassten Fahrten geben.

Sichtbare Spalten:

* Identifikation
* Start
* Ziel
* Kilometer
* Verbrauch / 100 km
* Verbrauchte Liter
* Kosten
* Sonstige Notizen

Datum und Fahrtindex sollen NICHT als eigene Spalten angezeigt werden.

Die Identifikation enthält bereits beide Informationen.

Beispiel:

```text
2026-09-13-01
2026-09-13-02
2026-09-14-01
```

Intern darf das Datenobjekt weiterhin Datum und Fahrtindex enthalten.

Beispiel:

```json
{
  "id": "2026-09-13-01",
  "datum": "2026-09-13",
  "index": 1,
  "start": "Frankfurt am Main",
  "ziel": "Bitterfeld",
  "zwischenziele": [],
  "kilometer": 405,
  "verbrauchPro100km": 7.8,
  "verbrauchteLiter": 31.59,
  "kosten": 54.37,
  "notizen": ""
}
```

# 4. Neue Fahrt erfassen

Zum Anlegen einer Fahrt soll ein übersichtliches Formular vorhanden sein.

Abgefragt werden:

* Datum
* Start
* Ziel
* Kilometer
* Verbrauch / 100 km
* Zwischenziele
* Sonstige Notizen

Der Fahrtindex soll NICHT vom Benutzer eingegeben werden.

Die Anwendung soll automatisch ermitteln, wie viele Fahrten am gewählten Datum bereits vorhanden sind.

Beispiel:

Existieren bereits:

```text
2026-09-13-01
2026-09-13-02
```

bekommt die nächste Fahrt automatisch:

```text
2026-09-13-03
```

Die Identifikation wird also automatisch nach folgendem Schema erzeugt:

```text
JJJJ-MM-TT-XX
```

# 5. Verbrauch

Die verbrauchten Liter werden automatisch berechnet:

```text
Verbrauchte Liter = Kilometer × Verbrauch / 100
```

Beispiel:

```text
250 km × 8,4 L / 100 km = 21 Liter
```

Die verbrauchten Liter sollen auf zwei Nachkommastellen dargestellt werden.

# 6. Start, Ziel und Zwischenziele

Es soll KEINE Karten- oder Google-Maps-Integration geben.

Start und Ziel sind normale Adresseingaben.

Zwischenziele sollen optional und dynamisch hinzugefügt werden können.

Beispiel:

```text
Start
Frankfurt am Main

Zwischenziel 1
Erfurt

Zwischenziel 2
Leipzig

Ziel
Bitterfeld
```

Zwischenziele sollen in der Fahrtenübersicht nicht zwingend eine eigene Spalte erhalten. Sie können zusammen mit den sonstigen Details einer Fahrt in einer Detailansicht dargestellt werden.

# 7. Favorisierte Adressen

Adressen sollen als Favoriten gespeichert werden können.

Ein Favorit besteht aus:

* ID
* Bezeichnung
* Adresse

Beispiele:

```text
Zuhause
Musterstraße 1, Frankfurt am Main
```

oder:

```text
Arbeit
Frankfurt am Main
```

Favoriten müssen:

* angelegt
* bearbeitet
* gelöscht

werden können.

Sie werden ebenfalls in der zentralen JSON-Datenstruktur gespeichert.

Bei der Eingabe von:

* Start
* Ziel
* Zwischenziel

sollen vorhandene Favoriten bequem ausgewählt werden können.

Zusätzlich soll neben einer Adresse eine Funktion wie „Als Favorit speichern“ angeboten werden.

# 8. Tanken

Es soll eine Tabelle für alle Tankvorgänge geben.

Sichtbare Spalten:

* Identifikation
* Getankte Liter
* Preis / Liter
* Gesamtpreis

Auch hier sollen Datum und Tankindex NICHT als eigene Spalten angezeigt werden.

Die Identifikation reicht aus.

Beispiel:

```text
2026-09-13-01
```

Beim Erstellen eines Tankvorgangs wird lediglich abgefragt:

* Datum
* Getankte Liter
* Preis / Liter

Der Tankindex wird automatisch vergeben.

Der Gesamtpreis wird automatisch berechnet:

```text
Gesamtpreis = getankte Liter × Preis / Liter
```

# 9. FIFO-Kostenberechnung

Ganz wichtig:

Die Fahrtkosten dürfen NICHT anhand eines durchschnittlichen Kraftstoffpreises berechnet werden.

Der Kraftstoff muss nach dem FIFO-Prinzip behandelt werden:

First In – First Out.

Die älteste noch vorhandene Tankfüllung wird zuerst verbraucht.

Beispiel:

Tankvorgang 1:

```text
80 Liter
1,70 € / Liter
```

Anschließend werden durch Fahrten 60 Liter verbraucht.

Es verbleiben:

```text
20 Liter zu 1,70 €
```

Nun wird erneut getankt:

```text
60 Liter
1,80 € / Liter
```

Der rechnerische Tankbestand besteht jetzt aus:

```text
20 Liter × 1,70 €
60 Liter × 1,80 €
```

Die nächsten 20 Liter Verbrauch werden weiterhin mit 1,70 € berechnet.

Erst danach wird der Kraftstoff mit 1,80 € verwendet.

Eine einzelne Fahrt kann dabei mehrere Tankfüllungen verbrauchen.

Beispiel:

Eine Fahrt verbraucht 30 Liter.

Vorhanden sind:

```text
20 Liter × 1,70 €
60 Liter × 1,80 €
```

Dann betragen die Fahrtkosten:

```text
20 × 1,70 €
+
10 × 1,80 €
=
52,00 €
```

Diese Berechnung muss automatisch erfolgen.

# 10. Chronologische Berechnung

Die FIFO-Berechnung muss chronologisch erfolgen.

Fahrten und Tankvorgänge müssen anhand von:

1. Datum
2. internem Index

sortiert und verarbeitet werden.

Wenn eine ältere Fahrt nachträglich hinzugefügt, bearbeitet oder gelöscht wird, müssen die Kraftstoffbestände und Kosten aller nachfolgenden Fahrten automatisch neu berechnet werden.

Das Gleiche gilt, wenn ein Tankvorgang:

* hinzugefügt
* bearbeitet
* gelöscht

wird.

Es darf niemals nur der einzelne Datensatz neu berechnet werden.

Stattdessen soll eine zentrale Funktion den kompletten chronologischen Verlauf neu berechnen.

# 11. Dashboard

Die Startseite soll eine moderne Übersicht mit Kennzahlen enthalten:

* Gesamtkilometer
* Anzahl Fahrten
* Durchschnittsverbrauch
* insgesamt verbrauchte Liter
* Fahrtkosten insgesamt
* insgesamt getankte Liter
* insgesamt für Kraftstoff ausgegeben
* aktueller rechnerischer Kraftstoffbestand
* aktueller Wert des noch vorhandenen Kraftstoffs

Zusätzlich sollen Diagramme dargestellt werden für:

* Kilometer pro Monat
* Verbrauch pro Monat
* Kraftstoffkosten pro Monat
* Durchschnittsverbrauch pro Monat
* Preis / Liter im Zeitverlauf

Für Diagramme darf Chart.js verwendet werden.

# 12. Detailansicht einer Fahrt

Beim Anklicken einer Fahrt soll eine Detailansicht erscheinen.

Diese zeigt:

* Identifikation
* Datum
* Start
* Zwischenziele
* Ziel
* Kilometer
* Verbrauch / 100 km
* Verbrauchte Liter
* Kosten
* Notizen

Hier darf das Datum angezeigt werden.

Der interne Fahrtindex muss nicht separat dargestellt werden, da er bereits Bestandteil der Identifikation ist.

Zusätzlich sollen Buttons für:

* Bearbeiten
* Löschen

vorhanden sein.

# 13. Fahrten suchen und filtern

Die Fahrtenübersicht soll durchsuchbar sein.

Textsuche über:

* Start
* Ziel
* Zwischenziele
* Notizen

Zusätzlich Filter für:

* Zeitraum
* Kilometer
* Verbrauch

Die Tabelle soll außerdem nach den wichtigsten Spalten sortierbar sein.

# 14. Bearbeiten und Löschen

Fahrten, Tankvorgänge und Favoriten müssen bearbeitet und gelöscht werden können.

Nach Änderungen an Fahrten oder Tankvorgängen muss automatisch eine vollständige Neuberechnung der FIFO-Kraftstoffbestände erfolgen.

Vor dem Löschen soll eine Sicherheitsabfrage erscheinen.

# 15. Warnung bei fehlendem Kraftstoff

Wenn laut den erfassten Tankvorgängen nicht genügend Kraftstoff vorhanden ist, um den errechneten Verbrauch einer Fahrt abzudecken, darf die Anwendung nicht abstürzen.

Stattdessen soll beispielsweise folgende Warnung erscheinen:

„Der berechnete Kraftstoffverbrauch überschreitet die bisher erfasste Tankmenge.“

Die Fahrt darf trotzdem gespeichert werden.

Der nicht zuordenbare Verbrauch soll intern gekennzeichnet werden.

Die Fahrtkosten dürfen für diesen Anteil nicht erfunden oder geschätzt werden.

# 16. Benutzeroberfläche

Die Anwendung soll modern und minimalistisch gestaltet sein.

Keine Excel-Optik.

Gewünscht sind:

* moderne Cards
* klare Tabellen
* übersichtliche Formulare
* responsive Navigation
* Icons
* gute Lesbarkeit
* dezente Animationen
* optionaler Dark Mode
* für Smartphone und Desktop optimiert

Navigation:

```text
Dashboard | Fahrten | Tanken | Favoriten | Einstellungen
```

Auf Smartphones darf daraus eine kompakte Navigation werden.

# 17. Technische Struktur

Verwende:

* HTML5
* CSS3
* modernes Vanilla JavaScript
* ES6-Module

Kein React, Vue oder Angular.

Strukturiere das Projekt beispielsweise so:

```text
/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── storage.js
│   ├── fahrten.js
│   ├── tanken.js
│   ├── fifo.js
│   ├── favorites.js
│   └── dashboard.js
└── data/
    └── beispiel-daten.json
```

Die Geschäftslogik muss sauber von der Benutzeroberfläche getrennt sein.

Insbesondere die FIFO-Berechnung soll als eigenständiges Modul implementiert werden.

# 18. Testfälle für FIFO

Implementiere Tests für mindestens folgende Fälle:

1. Verbrauch bleibt vollständig innerhalb einer Tankfüllung.
2. Verbrauch überschreitet eine Tankfüllung.
3. Verbrauch erstreckt sich über drei Tankfüllungen.
4. Eine Fahrt wird nachträglich eingefügt.
5. Eine Fahrt wird nachträglich geändert.
6. Ein Tankvorgang wird geändert.
7. Ein Tankvorgang wird gelöscht.
8. Es steht rechnerisch nicht genügend Kraftstoff zur Verfügung.
9. Eine Fahrt verbraucht exakt den Rest einer Tankfüllung.
10. Eine Fahrt verbraucht einen Teil der alten und einen Teil der neuen Tankfüllung.

# 19. Datenexport

Die komplette Datenbank muss jederzeit als eine einzelne JSON-Datei exportiert werden können.

Ebenso muss eine zuvor exportierte JSON-Datei wieder importiert werden können.

Beim Import sollen die Daten validiert werden, bevor die vorhandenen Daten überschrieben werden.

Vor dem Überschreiben soll eine Sicherheitsabfrage erfolgen.

# Ergebnis

Erstelle die Anwendung vollständig und funktionsfähig.

Liefere alle benötigten Dateien mit vollständigem Code.

Die Anwendung muss ohne Backend funktionieren und über einen einfachen lokalen Webserver gestartet werden können:

```bash
python -m http.server
```

Danach soll sie beispielsweise über:

```text
http://localhost:8000
```

funktionieren.

Achte insbesondere auf:

* zuverlässige lokale Datenspeicherung
* korrekte automatische Identifikationen
* automatische Fahrt- und Tankindizes
* korrekte chronologische FIFO-Berechnung
* Favoritenverwaltung für Adressen
* vollständige Neuberechnung nach Änderungen
* saubere Architektur
* moderne und intuitive Benutzeroberfläche
* gute Darstellung auf Desktop und Smartphone
