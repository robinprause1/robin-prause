# Robin Prause

Persönliche Seite. Eine Datei, ein Node-Prozess, kein Framework. Railway startet `node server.js` und liest `PORT`.

## VPS-Deployment

Für den VPS ist ein GitHub-Actions-Workflow vorbereitet: Pushes auf `main`
prüfen die Seiten und veröffentlichen nach einmaliger Einrichtung automatisch
nach `/var/www/robin-prause`. Einrichtung, Zugangsdaten und Wiederherstellung
sind in [deploy/README.md](deploy/README.md) beschrieben.

## Lokal

```bash
npm start
```

Dann [http://127.0.0.1:4321](http://127.0.0.1:4321).

`/mcp` ist ein zustandsloser MCP-Endpunkt im selben Node-Prozess. Er gibt den öffentlichen Profiltext und die Dokumenttitel zurück und ruft kein Modell. Auf Render bleibt das derselbe Free-Webdienst.

Die Startseite ist auf Deutsch. Englisch liegt unter `/en`. Der Lebenslauf liegt unter `/de/lebenslauf` und `/cv`. Texte stehen in `i18n/en.json` und `i18n/de.json`. Der Umschalter in der Navigation wechselt die Sprache.

## Railway

Dieses Verzeichnis ist ein eigenes Projekt. Deploy von hier:

```bash
railway up
```

`railway.toml` setzt Railpack, `node server.js` und einen Healthcheck auf `/`. Liegt noch kein Railway-Projekt, legt `railway up` eins an und meldet dich an, falls nötig.

## Was öffentlich liegt

Lebenslauf, Bachelorurkunde, Bachelorzeugnis, Arbeits- und Praktikumszeugnisse, SAFe-Zertifikat, ein Porträt.

Auf der Seite stehen Ort, Mail, Telefon und LinkedIn. Die Straße aus dem Lebenslauf steht nicht im HTML, sie steht im PDF.

## Was nicht auf der Seite liegt

Personalausweis, Meldebescheinigung, Sozialversicherung, Steuer-ID, Elster-Abrufcode, Krankenkasse, Unterschrift, Arbeitsverträge, Personalfragebögen, Zugangsdaten und die Potenzialanalyse. Die Bachelorarbeit selbst liegt im Ordner nicht als Dokument, nur das Zeugnis dazu.
