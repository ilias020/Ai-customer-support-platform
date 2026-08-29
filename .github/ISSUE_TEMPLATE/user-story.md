# Title — Als ... wil ik ... zodat ...

> De titel van een issue is een complete User Story die voldoet aan:
> **"Als ... wil ik ... zodat ..."**

---

## Acceptatiecriteria

> Acceptatiecriteria zijn de voorwaarden waaraan moet worden voldaan om de User Story te accepteren.
> Deze beschrijven het verwachte resultaat vanuit gebruikers- en productperspectief.

- [ ] Criterium 1
- [ ] Criterium 2
- [ ] Criterium 3

---

## Eisen

> Functionele en technische eisen waaraan de implementatie moet voldoen.
> Deze dienen als richtlijn tijdens de ontwikkeling.

- Eis 1
- Eis 2
- Eis 3

---

## Happy Path

> De Happy Path beschrijft de gewenste gebruikersflow.
> Gebruik genummerde stappen zodat Unhappy Paths hiernaar kunnen verwijzen.

1. De gebruiker ...
2. Het systeem ...
3. De gebruiker ...

---

## Unhappy Path

> De Unhappy Paths beschrijven alternatieve of ongewenste situaties.
> Verwijs waar mogelijk naar de betreffende stap uit de Happy Path.

- 2a. ...
- 2b. ...
- 3a. ...

---

## Security

> Beschrijf security-eisen die relevant zijn voor deze User Story.
> Denk aan authentication, authorization, workspace-isolatie, inputvalidatie en gevoelige data.
> Indien niet van toepassing: `Niet van toepassing`.

- Alleen geautoriseerde rollen mogen ...
- De resource moet tot de actieve Workspace behoren
- Cross-tenant toegang wordt geweigerd
- Input wordt server-side gevalideerd

---

## Test

> Beschrijf welke tests nodig zijn om de functionaliteit en belangrijke edge cases te valideren.
> Gebruik alleen testtypen die daadwerkelijk relevant zijn voor deze User Story.

| Test nummer | Doel | Type test | Test input | Verwacht resultaat |
| ----------- | ---- | --------- | ---------- | ------------------ |
| 1 | ... | Unit | ... | ... |
| 2 | ... | Integration | ... | ... |
| 3 | ... | E2E | ... | ... |

Mogelijke testtypen:

- Unit Test
- Integration Test
- API Test
- End-to-End Test
- Property-Based Test
- Monkey Test
- Security / Authorization Test
- Tenant Isolation Test

---

## Constraints

> Constraints zijn technische of organisatorische keuzes die voor deze User Story vaststaan.
> Denk aan frameworks, architectuur, libraries, API-conventies of andere projectafspraken.

Voorbeelden:

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: FastAPI
- Database: PostgreSQL
- API-prefix: `/api`
- Backend volgt de bestaande modulaire architectuur

---

## Dependencies / Impact

> Benoem afhankelijkheden met andere User Stories, API-endpoints, database-entiteiten of functionaliteit.
> Indien niet van toepassing: `Geen`.

- Afhankelijk van: #
- Heeft impact op:
- Vereist bestaande functionaliteit:

---

## Definition of Done

- [ ] Alle acceptatiecriteria zijn behaald
- [ ] Happy en relevante Unhappy Paths werken correct
- [ ] Relevante tests zijn geïmplementeerd en slagen
- [ ] Security-eisen zijn gecontroleerd
- [ ] Linting, formatting en typechecks slagen
- [ ] CI-pipeline slaagt
- [ ] Geen bekende blocking bugs
- [ ] Documentatie is bijgewerkt indien nodig

---

## Bronnen

> Benoem hier relevante bronnen die voor dit issue zijn gebruikt.
> Denk aan officiële documentatie, artikelen, ontwerpen, Wiki-documentatie of andere technische bronnen.

- 
