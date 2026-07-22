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

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

uvicorn app.main:app --reload
```

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
DATABASE_URL=<postgres_connection_string>
CLAUDE_API_KEY=<claude_api_key>
JWT_SECRET_KEY=<jwt_secret_key>
```

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

```bash
npm test
```

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
