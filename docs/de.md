# Open-Meteo Forecast Solar

Diese Integration schätzt, was deine Solarmodule heute und morgen erzeugen werden, anhand der
kostenlosen Wettervorhersage von [Open-Meteo](https://open-meteo.com). Kein Konto, kein
API-Schlüssel: Sie funktioniert direkt nach der Installation.

Es ist eine **Cloud**-Integration: Gladys muss `api.open-meteo.com` über das Internet
erreichen. Sie braucht Gladys 5.1 oder neuer.

## Bevor du anfängst

Die Prognose gilt für den **Standort deines Hauses in Gladys** (**Einstellungen → Häuser**).
Bei der Installation fragt Gladys, ob die Integration ihn lesen darf. Stehen deine Module
woanders, gibst du stattdessen ihre Koordinaten in der Konfiguration ein.

Halte die Beschreibung deiner Module bereit:

- ihre **Spitzenleistung**: die Summe der Leistungen auf ihren Typenschildern (10 Module mit
  400 W = 4 kWp);
- ihre **Neigung**: 0° flach, 90° senkrecht, auf einem Schrägdach oft 30° bis 45°;
- ihre **Ausrichtung**: die Richtung, in die sie zeigen, wie auf einem Kompass (180° = Süden).

## Konfiguration

Öffne **Integrationen → Open-Meteo Forecast Solar → Konfiguration**:

| Feld                     | Was eintragen                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Spitzenleistung (kWp)    | Gesamte Spitzenleistung der Module in Kilowatt.                                                                    |
| Neigung (°)              | 0 = flach, 90 = senkrecht. Standard 30.                                                                            |
| Ausrichtung (°)          | 0 = Norden, 90 = Osten, 180 = Süden, 270 = Westen. Standard 180.                                                   |
| Systemverluste (%)       | Wechselrichter, Kabel, Verschmutzung, Alterung. Standard 14. Senke den Wert, wenn die Schätzungen zu niedrig sind. |
| Erzeugungsschwelle (W)   | Die Leistung für den Auslöser „Geschätzte Erzeugung überschreitet die Schwelle“. Standard 1000 W.                  |
| Aktualisierung (Min.)    | Minuten zwischen zwei Abrufen bei Open-Meteo, mindestens 15. Standard 30.                                          |
| Breitengrad / Längengrad | Nur für Module abseits deines Hauses. Lass beide leer, um den Standort deines Gladys-Hauses zu verwenden.          |

Speichere und klicke dann auf **Prognose testen**: Die Antwort zeigt die geschätzte Erzeugung
von heute und morgen sowie die Spitze des Tages. Öffne danach den Tab **Erkennung** und füge
das Gerät **Solar forecast** hinzu.

## Das Gerät

| Funktion                              | Bedeutung                                         |
| ------------------------------------- | ------------------------------------------------- |
| Estimated power now (W)               | Was die Module in diesem Moment erzeugen sollten. |
| Estimated power next hour (W)         | Die mittlere Leistung der nächsten 60 Minuten.    |
| Estimated peak power today (W)        | Die höchste Leistung des Tages.                   |
| Estimated production today (kWh)      | Der ganze Tag, von Mitternacht bis Mitternacht.   |
| Estimated production left today (kWh) | Was heute noch kommt.                             |
| Estimated production tomorrow (kWh)   | Der ganze morgige Tag.                            |

Beim Hinzufügen kannst du das Gerät und seine Funktionen umbenennen. Die Leistung wird jede
Minute neu berechnet; Open-Meteo wird im Aktualisierungsintervall der Konfiguration erneut
abgerufen. Es sind **Prognosen**: Das Energie-Monitoring von Gladys zählt sie nie als echte
Erzeugung.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu, in der Kategorie
**Integrationen**.

### Auslöser

- **Geschätzte Erzeugung überschreitet die Schwelle** — startet die Szene, wenn die geschätzte
  Leistung über die Schwelle der Konfiguration steigt oder wieder darunter fällt. Wähle
  **Steigt darüber** oder **Fällt darunter** (oder lass es leer für beides). Die Szene kann
  `{{triggerEvent.data.power}}` (geschätzte Leistung, W), `{{triggerEvent.data.threshold}}` und
  `{{triggerEvent.data.direction}}` (`above` oder `below`) lesen.
- **Solarprognose aktualisiert** — startet die Szene bei jeder neuen Prognose (im
  Aktualisierungsintervall). Variablen: `energy_today`, `energy_remaining_today`,
  `energy_tomorrow` (kWh), `peak_power_today` (W) und `peak_time_today` (`HH:MM`).

### Aktionen

- **Solarprognose abrufen** — gibt die aktuellen Werte an die folgenden Aktionen weiter:
  Leistung jetzt, nächste Stunde und Spitze (W), Erzeugung heute, verbleibend und morgen (kWh),
  Uhrzeit der Spitze. Schalte **Zuerst Open-Meteo abrufen** ein, um vorher eine frische
  Prognose zu holen. `available` ist falsch, solange es keine Prognose gibt.
- **Sonnigstes Zeitfenster finden** — findet das Zeitfenster einer bestimmten Dauer (auf die
  Viertelstunde gerundet) mit der höchsten geschätzten Erzeugung, **heute** (ab jetzt) oder
  **morgen**. Ausgaben: `found`, `start` und `end` (`HH:MM`), `energy` (kWh) und
  `average_power` (W).

Beispiel: Starte jeden Abend um 21 Uhr **Sonnigstes Zeitfenster finden** (3 Stunden, morgen)
und schicke dir dann die Nachricht „Spülmaschine morgen zwischen {{0.0.start}} und
{{0.0.end}} starten“.

## Dashboard

Bearbeite ein Dashboard und füge das Widget **Solarprognose** hinzu. Es zeigt die geschätzte
Leistung jetzt und die Erzeugung von heute und morgen (live), die Erzeugungskurve beider Tage
mit der Spitze, was heute noch kommt, deine Anlage, ihren Standort und die Uhrzeit der letzten
Aktualisierung. Der Button **Aktualisieren** ruft Open-Meteo sofort ab.

## Fehlerbehebung

- **„Kein Standort“**: Lege den Standort deines Hauses unter **Einstellungen → Häuser** fest
  oder gib Breiten- und Längengrad in der Konfiguration ein.
- **„Open-Meteo war nicht erreichbar“**: Gladys hat keinen Internetzugang oder Open-Meteo ist
  gestört. Die letzte Prognose bleibt angezeigt (oranger Punkt am Badge des Geräts), und die
  Integration versucht es alle 5 Minuten erneut.
- **Die Schätzungen sind immer zu hoch oder zu niedrig**: Passe die **Systemverluste** an.
  Schatten und Schnee werden nicht berücksichtigt.
- Die Logs der Integration findest du unter **Einstellungen → Integrationen → Open-Meteo
  Forecast Solar → Logs**.

## Danksagung

Wetterdaten von [Open-Meteo.com](https://open-meteo.com/), unter
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Die kostenlose Open-Meteo-API ist
für die nicht-kommerzielle Nutzung bestimmt.
