# Robin Prause

Persönliche Seite. Eine Datei, ein Node-Prozess, kein Framework. Railway startet `node server.js` und liest `PORT`.

## Lokal

```bash
cd personal
npm start
```

Dann [http://127.0.0.1:4321](http://127.0.0.1:4321).

Der Abschnitt Fragen startet den Desk aus `intel/` mit. Antworten sind Sätze aus den Unterlagen. Jev entscheidet nur, ob die Treffer die Frage tragen. Der Schlüssel kommt aus der `.env` im Projektroot.

Die Seite ist auf Englisch. Deutsch liegt unter `/de`. Texte stehen in `i18n/en.json` und `i18n/de.json`. Der Umschalter in der Navigation wechselt die Sprache, auch für die Antworten.

## Railway

Dieses Verzeichnis ist ein eigenes Projekt und steht in der `.gitignore` von Wire. Deploy von hier, nicht vom Repository-Root:

```bash
cd personal
railway up
```

`railway.toml` setzt Railpack, `node server.js` und einen Healthcheck auf `/`. Liegt noch kein Railway-Projekt, legt `railway up` eins an und meldet dich an, falls nötig.

## Was öffentlich liegt

Lebenslauf, Bachelorurkunde, Bachelorzeugnis, Arbeits- und Praktikumszeugnisse, SAFe-Zertifikat, ein Porträt.

Auf der Seite stehen Ort, Mail, Telefon und LinkedIn. Die Straße aus dem Lebenslauf steht nicht im HTML, sie steht im PDF.

## Was nicht auf der Seite liegt

Personalausweis, Meldebescheinigung, Sozialversicherung, Steuer-ID, Elster-Abrufcode, Krankenkasse, Unterschrift, Arbeitsverträge, Personalfragebögen, Zugangsdaten und die Potenzialanalyse. Die Bachelorarbeit selbst liegt im Ordner nicht als Dokument, nur das Zeugnis dazu.
