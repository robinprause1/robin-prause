"""Profile desk. Same index path as Wire: clean, embed, sparse terms, reciprocal rank fusion, then Jev."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import urllib.error
import urllib.request
from pathlib import Path

from haystack import Document
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.document_stores.qdrant import QdrantDocumentStore

from intel.index import EMBEDDER_DIM, WireIndex, use_lexicon

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
CORPUS = HERE / "corpus.json"
INDEX_PATH = HERE / "data" / "qdrant"
_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
_BAR = 0.55
_LANGS = ("en", "de")
_COPY = {
    "en": {
        "short": "Ask a more specific question.",
        "empty": "The documents do not cover that.",
        "refuse": "The published documents do not state that.",
    },
    "de": {
        "short": "Stell die Frage etwas konkreter.",
        "empty": "Dazu steht in den Unterlagen nichts.",
        "refuse": "Dazu steht in den veröffentlichten Unterlagen nichts Konkretes.",
    },
}

_STOP = {
    "und", "oder", "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen",
    "ich", "du", "dir", "dich", "mir", "was", "wie", "wo", "wann", "wer", "welche", "welcher", "welches",
    "bist", "hast", "habe", "hat", "war", "ist", "sind", "ein", "zur", "zum", "von", "im", "in", "am",
    "an", "auf", "für", "mit", "bei", "nach", "über", "unter", "aus", "als", "auch", "nicht", "noch",
    "nur", "sehr", "schon", "dein", "deine", "deinen", "about", "the", "and", "you", "your",
}

# Readable passages of the public record. Scanned certificates have no text layer.
_PASSAGES: list[tuple[str, str, str]] = [
    (
        "Profil",
        "/documents/lebenslauf.pdf",
        "Beruflich arbeitet Robin Prause aktuell als Chief Technology Officer bei smartport Marketplace B.V. in Amsterdam und remote aus Rodgau. "
        "Er verantwortet einen Multi-Vendor-Marktplatz für Consumer Electronics mit Storefronts in Deutschland und Italien, "
        "Händler-Onboarding, Split-Payments, Suche, Support und Versand. Die Plattform ist eine Eigenentwicklung. "
        "Gearbeitet wird mit KI-Agenten. Ein Audit-Log schreibt jede Zustandsänderung mit.",
    ),
    (
        "Kontakt",
        "/",
        "Robin Prause ist per Mail unter mail@robin-prause.de erreichbar, auf LinkedIn unter linkedin.com/in/robin-prause-330666278 "
        "und telefonisch unter +49 152 53281802. Er lebt in Rodgau.",
    ),
    (
        "Stack",
        "/documents/lebenslauf.pdf",
        "Der aktuelle Stack ist Next.js, NestJS, PostgreSQL, Redis, Turborepo, Docker, Railway und Cloudflare, in TypeScript. "
        "Davor Angular, Shopify und Vue. Integrationen auf dem Marktplatz sind unter anderem Mollie Connect, Algolia, "
        "Intercom, Sentry, Trusted Shops, DHL, GLS und Ship24.",
    ),
    (
        "Chief Technology Officer, smartport Marketplace B.V.",
        "/documents/lebenslauf.pdf",
        "Seit Februar 2026 ist Robin Prause Chief Technology Officer der smartport Marketplace B.V. in Amsterdam, remote. "
        "Er verantwortet Strategie, Entwicklung und Betrieb der Marktplatz- und ERP-Plattform. Storefronts in Next.js, "
        "Backend in NestJS, PostgreSQL, Turborepo, Railway, Cloudflare. Provisionsmodelle und Auszahlungen bleiben konfigurierbar.",
    ),
    (
        "Head of E-Commerce, smartport GmbH",
        "/documents/lebenslauf.pdf",
        "Von Juli 2025 bis Januar 2026 war Robin Prause Head of E-Commerce der smartport GmbH in Dietzenbach. "
        "Er hatte die Produktverantwortung für die Onlineshops, von der Roadmap über Shopify bis zu Lager und Kundenservice.",
    ),
    (
        "Software Engineer, Randstad Digital",
        "/documents/zeugnis-randstad-digital.pdf",
        "Von März 2024 bis Juni 2025 war Robin Prause Software Engineer bei der Randstad Digital Germany AG in Eschborn. "
        "Das Zeugnis beschreibt eine Angular-19-Anwendung im Nx-Monorepo, UI nach Figma mit Tailwind, Schnittstellen über OpenAPI und RxJS, "
        "Tests mit Jest, Cypress und Cucumber. Das Arbeitszeugnis umfasst den Zeitraum vom 14. August 2023 bis 30. Juni 2025, "
        "zuerst als Bachelorand und ab März 2024 als Software Engineer.",
    ),
    (
        "Bachelorarbeit, Randstad Digital",
        "/documents/zeugnis-bachelorarbeit.pdf",
        "Von August 2023 bis Februar 2024 schrieb Robin Prause seine Bachelorarbeit bei Randstad Digital, vormals AUSY Technologies. "
        "Das Zeugnis vom 14. August 2023 bis 6. November 2023 nennt das Thema: experimentelle Bearbeitung der Möglichkeiten und Grenzen "
        "chatbasierter KI-Modelle für die Webentwicklung. Dazu gehörten eine Web-Anwendung, ein Backend mit chatbasierten KI-Modellen "
        "und eine grafische Oberfläche.",
    ),
    (
        "Praktikum, Abrio",
        "/documents/zeugnis-abrio.pdf",
        "Von April 2023 bis Juni 2023 war Robin Prause Praktikant im Frontend bei der Abrio GmbH in Frankfurt. "
        "Aufgaben laut Zeugnis: Scrum, Shopify Theme Development, GraphQL- und REST-Anbindungen, Shopify Apps mit React, Express und Polaris, "
        "App-Extensions und Shopify Flows.",
    ),
    (
        "Werkstudent, Gewa Comp",
        "/documents/zeugnis-gewacomp.pdf",
        "Von Januar 2023 bis März 2023 war Robin Prause Werkstudent im Web-Development bei der Gewa Comp GmbH in Obertshausen. "
        "Das Zeugnis nennt Angular, DevExtreme, Bootstrap, REST-APIs auf ASP.NET, eine CI/CD-Pipeline und eine Progressive Web App.",
    ),
    (
        "Hilfskraft, Universitätsmedizin Mainz",
        "/documents/zeugnis-unimedizin-mainz.pdf",
        "Von April 2022 bis September 2022 war Robin Prause wissenschaftliche Hilfskraft im Schwerpunkt E-Mental-Health "
        "der Universitätsmedizin Mainz, mit acht Wochenstunden. Er arbeitete im Frontend mit Vue.js, HTML, CSS und JSON "
        "an einem Modul zur Return-to-Work-Planung.",
    ),
    (
        "Praktikum, UHP",
        "/documents/zeugnis-uhp.pdf",
        "Im August und September 2021 war Robin Prause Praktikant bei der UHP Software GmbH in Darmstadt. "
        "Das Zeugnis nennt das PHP-Framework Symfony, Features an einem internen Verwaltungstool und Tests.",
    ),
    (
        "Freelancer, MGVO",
        "/",
        "Von Oktober 2022 bis Dezember 2024 arbeitete Robin Prause als Freelancer an MGVO, einer Software für Vereinsmanagement.",
    ),
    (
        "Studium",
        "/documents/bachelorurkunde.pdf",
        "Robin Prause hat Medieninformatik an der Technischen Hochschule Mittelhessen in Friedberg studiert, von 2020 bis 2024. "
        "Die Bachelorprüfung hat er am 19. Dezember 2023 bestanden. Der akademische Grad ist Bachelor of Science. "
        "Fachbereiche sind Informationstechnik-Elektrotechnik-Mechatronik sowie Mathematik, Naturwissenschaften und Datenverarbeitung. "
        "Urkunde und Zeugnis liegen als PDF vor.",
    ),
    (
        "Schule und Sprachen",
        "/",
        "Robin Prause hat 2020 Abitur an der Paul-Gerhardt-Schule in Hanau gemacht. Deutsch ist Muttersprache, Englisch spricht er fließend.",
    ),
    (
        "Zertifikate",
        "/documents/zertifikat-safe-agilist.pdf",
        "Robin Prause ist Certified SAFe 6 Agilist, Zertifikat 71452272-1424, gültig bis September 2025.",
    ),
]

_PASSAGES_EN: list[tuple[str, str, str]] = [
    (
        "Profile",
        "/documents/lebenslauf.pdf",
        "Robin Prause currently works as Chief Technology Officer at smartport Marketplace B.V. in Amsterdam, remotely from Rodgau. "
        "His work is a multi-vendor marketplace for consumer electronics, with storefronts in Germany and Italy, "
        "merchant onboarding, split payments, search, support, and shipping. The platform is built in-house. "
        "The work uses AI agents. An audit log records every state change.",
    ),
    (
        "Contact",
        "/",
        "Robin Prause can be reached by email at mail@robin-prause.de, on LinkedIn at linkedin.com/in/robin-prause-330666278, "
        "and by phone at +49 152 53281802. He lives in Rodgau.",
    ),
    (
        "Stack",
        "/documents/lebenslauf.pdf",
        "The current stack is Next.js, NestJS, PostgreSQL, Redis, Turborepo, Docker, Railway, and Cloudflare, in TypeScript. "
        "Before that, Angular, Shopify, and Vue. Marketplace integrations include Mollie Connect, Algolia, "
        "Intercom, Sentry, Trusted Shops, DHL, GLS, and Ship24.",
    ),
    (
        "Chief Technology Officer, smartport Marketplace B.V.",
        "/documents/lebenslauf.pdf",
        "Since February 2026 Robin Prause has been Chief Technology Officer of smartport Marketplace B.V. in Amsterdam, working remotely. "
        "He is responsible for strategy, development, and operations of the marketplace and ERP platform. Storefronts in Next.js, "
        "backend in NestJS, PostgreSQL, Turborepo, Railway, Cloudflare. Commission models and payouts stay configurable.",
    ),
    (
        "Head of E-Commerce, smartport GmbH",
        "/documents/lebenslauf.pdf",
        "From July 2025 to January 2026 Robin Prause was Head of E-Commerce at smartport GmbH in Dietzenbach. "
        "He owned the product for the online shops, from the roadmap through Shopify to warehouse and customer service.",
    ),
    (
        "Software Engineer, Randstad Digital",
        "/documents/zeugnis-randstad-digital.pdf",
        "From March 2024 to June 2025 Robin Prause was a software engineer at Randstad Digital Germany AG in Eschborn. "
        "The reference describes an Angular 19 application in an Nx monorepo, UI from Figma with Tailwind, interfaces over OpenAPI and RxJS, "
        "and tests with Jest, Cypress, and Cucumber. The employment reference covers 14 August 2023 to 30 June 2025, "
        "first as the bachelor's thesis student and from March 2024 as a software engineer.",
    ),
    (
        "Bachelor's thesis, Randstad Digital",
        "/documents/zeugnis-bachelorarbeit.pdf",
        "From August 2023 to February 2024 Robin Prause wrote his bachelor's thesis at Randstad Digital, formerly AUSY Technologies. "
        "The reference from 14 August 2023 to 6 November 2023 names the topic: an experimental study of what chat-based AI models "
        "can and cannot do for web development. That included a web application, a backend with chat-based AI models, and a graphical interface.",
    ),
    (
        "Internship, Abrio",
        "/documents/zeugnis-abrio.pdf",
        "From April 2023 to June 2023 Robin Prause was a frontend intern at Abrio GmbH in Frankfurt. "
        "The reference names Scrum, Shopify theme development, GraphQL and REST integrations, Shopify apps with React, Express, and Polaris, "
        "app extensions, and Shopify Flows.",
    ),
    (
        "Working student, Gewa Comp",
        "/documents/zeugnis-gewacomp.pdf",
        "From January 2023 to March 2023 Robin Prause was a working student in web development at Gewa Comp GmbH in Obertshausen. "
        "The reference names Angular, DevExtreme, Bootstrap, REST APIs on ASP.NET, a CI/CD pipeline, and a progressive web app.",
    ),
    (
        "Research assistant, University Medical Center Mainz",
        "/documents/zeugnis-unimedizin-mainz.pdf",
        "From April 2022 to September 2022 Robin Prause was a research assistant in the E-Mental-Health unit "
        "at the University Medical Center Mainz, eight hours a week. He worked on the frontend with Vue.js, HTML, CSS, and JSON "
        "on a module for return-to-work planning.",
    ),
    (
        "Internship, UHP",
        "/documents/zeugnis-uhp.pdf",
        "In August and September 2021 Robin Prause was an intern at UHP Software GmbH in Darmstadt. "
        "The reference names the PHP framework Symfony, features on an internal administration tool, and tests.",
    ),
    (
        "Freelancer, MGVO",
        "/",
        "From October 2022 to December 2024 Robin Prause worked as a freelancer on MGVO, software for club management.",
    ),
    (
        "Studies",
        "/documents/bachelorurkunde.pdf",
        "Robin Prause studied media computer science, Medieninformatik, at the Technische Hochschule Mittelhessen in Friedberg, from 2020 to 2024. "
        "He passed the bachelor's examination on 19 December 2023. The degree is Bachelor of Science. "
        "The faculties are information technology, electrical engineering, and mechatronics, plus mathematics, natural sciences, and data processing. "
        "The certificate and the transcript are available as PDFs.",
    ),
    (
        "School and languages",
        "/",
        "In 2020 Robin Prause completed the Abitur at the Paul-Gerhardt-Schule in Hanau. German is his native language, and he speaks English fluently.",
    ),
    (
        "Certificates",
        "/documents/zertifikat-safe-agilist.pdf",
        "Robin Prause is a Certified SAFe 6 Agilist, certificate 71452272-1424, valid through September 2025.",
    ),
]


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def open_index() -> WireIndex:
    if use_lexicon():
        memory = InMemoryDocumentStore(embedding_similarity_function="cosine")
        return WireIndex(memory, sparse=False)
    if INDEX_PATH.exists():
        shutil.rmtree(INDEX_PATH)
    INDEX_PATH.mkdir(parents=True)
    vector = QdrantDocumentStore(
        path=str(INDEX_PATH),
        index="prause",
        embedding_dim=EMBEDDER_DIM,
        on_disk=True,
        on_disk_payload=True,
        use_sparse_embeddings=True,
        sparse_idf=True,
        similarity="cosine",
        recreate_index=True,
        payload_fields_to_index=[{"field_name": "meta.source", "field_schema": "keyword"}],
        wait_result_from_api=True,
        force_disable_check_same_thread=True,
        progress_bar=False,
        return_embedding=False,
    )
    return WireIndex(vector, sparse=True)


def build(index: WireIndex) -> int:
    documents: list[Document] = []
    for lang, passages in (("de", _PASSAGES), ("en", _PASSAGES_EN)):
        for title, url, text in passages:
            documents.extend(_chunks(lang, title, url, text))
    if CORPUS.exists():
        raw = json.loads(CORPUS.read_text(encoding="utf-8"))
        labels = {
            "lebenslauf": ("Lebenslauf", "/documents/lebenslauf.pdf"),
            "zeugnis-abrio": ("Praktikumszeugnis Abrio", "/documents/zeugnis-abrio.pdf"),
            "zeugnis-unimedizin-mainz": ("Arbeitszeugnis Universitätsmedizin Mainz", "/documents/zeugnis-unimedizin-mainz.pdf"),
            "zertifikat-safe-agilist": ("Certified SAFe 6 Agilist", "/documents/zertifikat-safe-agilist.pdf"),
        }
        for key, text in raw.items():
            if key == "lebenslauf":
                continue
            title, url = labels.get(key, (key, "/"))
            documents.extend(_chunks("de", title, url, _redact(str(text))))
    if documents:
        index.index_pipeline.run({"cleaner": {"documents": documents}})
    return len(documents)


def ask(index: WireIndex, question: str, lang: str = "en") -> dict[str, object]:
    language = lang if lang in _LANGS else "en"
    copy = _COPY[language]
    cleaned = " ".join(question.split())
    if len(cleaned) < 3:
        return _reply(copy["short"], [], None)
    hits = index.search(cleaned, limit=6, source=f"prause-{language}")
    notes = [{"title": hit.title, "text": hit.text, "url": hit.url} for hit in hits if hit.text.strip()]
    if not notes:
        return _reply(copy["empty"], [], None)
    chosen, probability = _jev(cleaned, notes)
    if chosen is None:
        picked = _sentences(cleaned, notes)
        if not picked:
            return _reply(copy["refuse"], [], None)
    elif chosen < 0:
        return _reply(copy["refuse"], [], probability)
    else:
        note = notes[chosen]
        lead = _lead(note["text"]) or note["text"][:280]
        picked = _sentences(cleaned, [note]) or [(note["title"], note["url"], lead)]
    sources: list[dict[str, str]] = []
    seen: set[str] = set()
    lines: list[str] = []
    for title, url, sentence in picked[:3]:
        lines.append(sentence)
        if not url.startswith("/") or url == "/" or url in seen:
            continue
        seen.add(url)
        sources.append({"title": str(title), "url": str(url)})
    return _reply(" ".join(lines), sources, probability)


def _chunks(lang: str, title: str, url: str, text: str) -> list[Document]:
    words = text.split()
    pieces: list[str] = []
    current: list[str] = []
    for word in words:
        current.append(word)
        if len(" ".join(current)) >= 420:
            pieces.append(" ".join(current))
            current = current[-12:]
    tail = " ".join(current).strip()
    if tail:
        pieces.append(tail)
    documents: list[Document] = []
    for index, piece in enumerate(pieces):
        digest = hashlib.sha256(f"{lang}\n{title}\n{index}\n{piece}".encode()).hexdigest()
        documents.append(
            Document(
                id=digest,
                content=f"{title}. {piece}",
                meta={"source": f"prause-{lang}", "title": title[:300], "url": url[:500], "published_at": ""},
            )
        )
    return documents


def _redact(text: str) -> str:
    text = text.replace("Ludwigstr. 111, 63110 Rodgau", "Rodgau")
    text = re.sub(r"Westbahnhofstraße\s+34\s+63450\s+Hanau", "", text)
    text = re.sub(r"geboren am \d{2}\.\d{2}\.\d{4}[^.\n]*", "", text)
    text = re.sub(r"geb\. am \d{2}\.\d{2}\.\d{4}", "", text)
    return text


def _sentences(question: str, notes: list[dict[str, str]]) -> list[tuple[str, str, str]]:
    query = set(_tokens(question))
    scored: list[tuple[int, str, str, str]] = []
    for note in notes:
        parts = _parts(note["text"])
        for part in parts:
            sentence = " ".join(part.split())
            words = _tokens(sentence)
            if len(words) < 4 or len(sentence) > 280:
                continue
            overlap = len(query & set(words))
            scored.append((overlap, note["title"], note["url"], sentence))
    scored.sort(key=lambda row: row[0], reverse=True)
    chosen: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for overlap, title, url, sentence in scored:
        if overlap < 1 or sentence in seen:
            continue
        seen.add(sentence)
        chosen.append((title, url, sentence))
        if len(chosen) == 3:
            break
    return chosen


def _tokens(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-zA-ZäöüÄÖÜß0-9]{3,}", text.lower()) if token not in _STOP]


def _parts(text: str) -> list[str]:
    return re.split(r"(?<!\d)(?<=[.!?])\s+(?=[A-ZÄÖÜ])|\n+", text)


def _lead(text: str) -> str:
    parts = _parts(text)
    kept: list[str] = []
    for part in parts:
        sentence = " ".join(part.split())
        if len(_tokens(sentence)) < 4 or len(sentence) > 280:
            continue
        kept.append(sentence)
        if len(kept) == 2:
            break
    return " ".join(kept)


def _jev(question: str, notes: list[dict[str, str]]) -> tuple[int | None, float | None]:
    api_key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if not api_key:
        return None, None
    criteria = {
        f"n{index}": f"{note['title']}: {note['text'][:220]}"
        for index, note in enumerate(notes)
    }
    criteria["none"] = "No note answers the question."
    payload = {
        "model": os.environ.get("JEV_MODEL", "jev-latest"),
        "state": {"question": question, "notes": notes},
        "questions": {
            "answered": {
                "type": "noul",
                "instructions": (
                    "Do the notes contain a concrete fact that answers `question` about Robin Prause, including the time it asks about? "
                    "A past role does not answer a question about what he does now. "
                    "Questions the notes do not cover are no."
                ),
                "criteria": {
                    "true": "A note states the fact the question asks for, including present versus past.",
                    "false": "The notes do not answer the question as asked.",
                },
            },
            "source": {
                "type": "choice",
                "instructions": (
                    "Which note answers the question about Robin Prause as asked? "
                    "If the question is about current work, choose the ongoing role, not an earlier job. "
                    "Choose none when no note matches."
                ),
                "criteria": criteria,
            },
        },
    }
    request = urllib.request.Request(
        _ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            body = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None, None
    answers = body.get("answers") if isinstance(body, dict) else None
    if not isinstance(answers, dict):
        return None, None
    raw = answers.get("answered")
    yes = raw.get("noul") if isinstance(raw, dict) else None
    if isinstance(yes, bool) or not isinstance(yes, (int, float)):
        return None, None
    probability = float(yes)
    if probability < _BAR:
        return -1, probability
    source = answers.get("source")
    selected = source.get("choice") if isinstance(source, dict) else None
    if not isinstance(selected, str) or not selected.startswith("n"):
        return -1, probability
    suffix = selected[1:]
    if not suffix.isdigit():
        return -1, probability
    index = int(suffix)
    if index < 0 or index >= len(notes):
        return -1, probability
    return index, probability


def _reply(answer: str, sources: list[dict[str, str]], probability: float | None) -> dict[str, object]:
    return {"answer": answer, "sources": sources, "checked": probability}
