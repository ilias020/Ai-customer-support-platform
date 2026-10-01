# AI Customer Support Platform

## 📖 Projectbeschrijving

AI Customer Support Platform is een SaaS-oplossing waarmee bedrijven een slimme AI-chatbot kunnen inzetten om klantvragen automatisch te beantwoorden. Het platform biedt bedrijven de mogelijkheid om hun chatbot te configureren, kennisbronnen te beheren en gesprekken te analyseren via een overzichtelijk dashboard.

Dit project wordt ontwikkeld als persoonlijk portfolio-project met de focus op moderne softwareontwikkeling, softwarearchitectuur, DevOps en AI-integratie.

---

# ✨ Functionaliteiten

De eerste versie van het platform bevat onder andere de volgende functionaliteiten:

- Bedrijfsaccounts registreren en beheren
- Veilige authenticatie en autorisatie
- AI-chatbot configureren
- Kennisbank en FAQ beheren
- Automatisch beantwoorden van klantvragen met AI
- Dashboard met chatbot- en gespreksinformatie
- Chatgeschiedenis bekijken
- Beheer van bedrijfsgegevens en instellingen

---

# 🛠️ Tech Stack

| Onderdeel | Technologie |
| ---------- | ----------- |
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| AI | Claude API |
| Containerisatie | Docker, Docker Compose |
| CI/CD | GitHub Actions |

---

# 🚀 Getting Started

Volg onderstaande stappen om het project lokaal op te starten.

## Vereisten

Installeer vooraf de volgende software:

- Git
- Node.js (LTS)
- Python 3.12 of hoger
- PostgreSQL
- Docker Desktop
- Docker Compose

---

# 📦 Installatie

Clone de repository:

```bash
git clone https://github.com/<username>/ai-customer-support-platform.git
```

Ga vervolgens naar de juiste map en installeer de benodigde dependencies voor zowel de frontend als backend.

---

# ▶️ Applicatie starten

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Backend

Maak eerst `backend/.env` en de `.env` in de projectroot aan zoals beschreven bij [Environment Variables](#️-environment-variables).

Start vervolgens de volledige lokale omgeving:

```bash
docker compose up -d --build --wait
```

Voer de database-migraties uit binnen de backend-container:

```bash
docker compose exec backend python -m alembic upgrade head
```

De frontend, backend en PostgreSQL draaien daarna gezamenlijk via Docker Compose.

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- API-documentatie: `http://localhost:8000/docs`

Stop de lokale omgeving met:

```bash
docker compose down
```

## Docker: frontend dependencies vernieuwen

De frontend gebruikt een persistent Docker-volume voor `node_modules`. Wanneer `frontend/package.json` of `frontend/package-lock.json` verandert, moet dit volume opnieuw worden aangemaakt zodat de container de actuele dependencies gebruikt.

Verwijder het bestaande `node_modules`-volume via Docker Compose:

```powershell
docker compose rm -s -f -v frontend
```

Bouw en start daarna de frontend opnieuw:

```powershell
docker compose up -d --build frontend
```

Docker Compose maakt het benodigde `node_modules`-volume automatisch opnieuw aan op basis van het huidige Compose-project. Het PostgreSQL-volume blijft hierbij behouden.

---

# ⚙️ Environment Variables

Voor zowel de frontend als backend wordt gebruikgemaakt van een `.env` bestand.

## Frontend

Maak in de map `frontend` een `.env.local` bestand aan.

```env
NEXT_PUBLIC_API_URL=<backend_url>
```

## Backend

Maak in de map `backend` een `.env` bestand aan.

```env
APP_NAME=Nimbus API
ENVIRONMENT=development
LOG_LEVEL=INFO
DATABASE_URL=postgresql+psycopg://nimbus:<postgres_password>@127.0.0.1:5432/ai_customer_support
TEST_DATABASE_URL=postgresql+psycopg://nimbus:<postgres_password>@127.0.0.1:5432/ai_customer_support_test
CLAUDE_API_KEY=<claude_api_key>
JWT_SECRET_KEY=<jwt_secret_key>
```

Maak daarnaast in de projectroot een `.env` voor Docker Compose. Gebruik voor
`POSTGRES_PASSWORD` dezelfde waarde als `<postgres_password>` in `DATABASE_URL`.

```env
POSTGRES_DB=ai_customer_support
POSTGRES_USER=nimbus
POSTGRES_PASSWORD=<postgres_password>
DOCKER_DATABASE_URL=postgresql+psycopg://nimbus:<url_encoded_postgres_password>@postgres:5432/ai_customer_support
```

PostgreSQL gebruikt lokaal vast poort `5432`. De optie `--wait` wacht totdat
PostgreSQL gezond is voordat de Alembic-migraties worden uitgevoerd.

`DOCKER_DATABASE_URL` wordt door de backend-container gebruikt om verbinding te maken met de PostgreSQL-service binnen Docker. Gebruik hiervoor dezelfde databasegegevens als hierboven. Het wachtwoord in `DOCKER_DATABASE_URL` moet URL-encoded worden als het gereserveerde URL-tekens bevat.

### Testdatabase

De backendtests gebruiken een aparte PostgreSQL-database om te voorkomen dat tests
de developmentdatabase wijzigen. Deze database wordt geconfigureerd via
`TEST_DATABASE_URL` in `backend/.env`.

Nadat PostgreSQL via Docker Compose is gestart, maak je de testdatabase eenmalig aan:

```powershell
docker compose exec postgres createdb -U nimbus ai_customer_support_test
```

Voer daarna vanuit de map `backend` de Alembic-migraties uit op de testdatabase:

```powershell
$env:DATABASE_URL = python -c "from dotenv import dotenv_values; print(dotenv_values('.env')['TEST_DATABASE_URL'])"
python -m alembic upgrade head
Remove-Item Env:DATABASE_URL
```

Daarna kunnen de backendtests worden uitgevoerd:

```powershell
pytest -v
```

De tests vereisen een geldige `TEST_DATABASE_URL` en gebruiken
`ai_customer_support_test` als geïsoleerde testdatabase.

---

# 🗄️ Database

De applicatie maakt gebruik van een PostgreSQL-database.

Zorg ervoor dat:

- PostgreSQL is geïnstalleerd;
- de database is aangemaakt;
- de connection string correct is ingevuld in het `.env` bestand.

---

# 🧪 Testen

## Frontend

Frontendtests worden toegevoegd zodra de testinfrastructuur is ingericht.

## Backend

```bash
pytest
```

---

# 📚 Documentatie

Uitgebreide projectdocumentatie is beschikbaar in de GitHub Wiki, waaronder:

- Concurrentieanalyse
- Doelgroepanalyse
- Requirements
- Projectplanning
- Sprint Log
- Software Architectuur
- Database Ontwerp
- API Ontwerp

---

# 🛣️ Roadmap

Geplande uitbreidingen:

- AI-chatbot ontwikkelen
- Dashboard implementeren
- Kennisbank beheren
- Docker-omgeving opzetten
- CI/CD-pipeline configureren
- Logging en monitoring toevoegen
- Deployment naar productie

---

# 👨‍💻 Auteur

**Ilias Merbout**
