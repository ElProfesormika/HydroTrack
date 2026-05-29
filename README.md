# HydroTrack

**Plateforme de supervision et de détection des fuites sur réseau d'eau potable**

HydroTrack combine l'analyse des **compteurs** (machine learning), la **confirmation par capteurs pression** (ondes transitoires) et la **localisation métrique** des fuites sur le plan du site. L'application cible un réseau modélisé d'environ **10 km**, **22 compteurs**, **33 zones capteurs** et **66 capteurs pression** (2 par tronçon).

---

## Fonctionnalités

| Domaine | Description |
|---------|-------------|
| **Compteurs & ML** | Détection d'anomalies de débit (IsolationForest), probabilité de fuite, alertes par seuils unifiés |
| **Capteurs pression** | Scores d'onde transitoire, corrélation amont/aval, confirmation de fuite |
| **Physique** | Vitesse d'onde *c*, position *x = (L + c·Δt) / 2*, zone estimée *R* |
| **Cartographie** | Plan EDF intégré — tronçons colorés, compteurs ML, point de fuite + rayon |
| **Temps réel** | WebSocket, tableaux de bord KPI, séries temporelles |
| **Administration** | Gestion du référentiel (compteurs, capteurs, zones, incidents) |

### Chaîne décisionnelle

```
Relevé compteur → ML (suspicion ≥ 45 %)
       → Analyse capteurs (onde transitoire)
       → Confirmation multi-critères
       → Localisation (x, R) sur le tronçon
```

---

## Stack technique

| Couche | Technologies |
|--------|----------------|
| **Backend** | Python 3.12+, FastAPI, Pydantic, scikit-learn, SQLite |
| **Frontend** | React 18, Vite, React Router, Leaflet, Chart.js |
| **IA** | IsolationForest (300 arbres), calibration par quantiles par compteur |
| **Physique** | Modèle fluide + paroi élastique (*K*, *E*, *D*, *e*) |

---

## Prérequis

- **Python** ≥ 3.10  
- **Node.js** ≥ 18 et **npm**  
- **Git**

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/ElProfesormika/HydroTrack.git
cd HydroTrack
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Frontend

```bash
cd ../frontend
npm install
```

---

## Démarrage (développement)

**Terminal 1 — API**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Interface**

```bash
cd frontend
npm run dev
```

| Service | URL |
|---------|-----|
| Application | [http://localhost:5173](http://localhost:5173) |
| API (Swagger) | [http://localhost:8000/docs](http://localhost:8000/docs) |
| Santé API | [http://localhost:8000/health](http://localhost:8000/health) |
| WebSocket | `ws://localhost:8000/ws/events` |

---

## Interface

| Route | Rôle |
|-------|------|
| `/dashboard` | Synthèse réseau et KPI |
| `/dashboard/compteurs` | Suivi détaillé par compteur (`?meter=ID`) |
| `/dashboard/capteurs` | Zones, confirmation, localisation physique |
| `/dashboard/detection` | Anomalies ML et scores |
| `/dashboard/alertes` | Journal et statistiques d'alertes |
| `/cartographie` | Cartes capteurs/zones et compteurs |
| `/releves` | Relevés compteurs |
| `/admin` | Administration du référentiel et des incidents |

---

## API (aperçu)

**Ingestion**

```bash
curl -X POST "http://localhost:8000/api/meters/data" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-04-17T12:00:00Z",
    "meter_id": "AMPERE_1",
    "volume": 120.2,
    "flow_rate": 23.7
  }'
```

```bash
curl -X POST "http://localhost:8000/api/sensors/pressure" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-04-17T12:00:00Z",
    "sensor_id": "S_Z06_A",
    "zone": "Zone 6",
    "pressure_signal": 1.2,
    "frequency": 14.0,
    "intensity": 78.0
  }'
```

**Consultation** — `/api/anomalies`, `/api/alerts`, `/api/leaks/localizations`, `/api/map/meters`, `/api/map/sensors`, `/api/dashboard/wave-physics`

---

## Données de démonstration

```bash
# Relevés compteurs depuis CSV (backend démarré)
python3 scripts/ingest_csv.py --csv CALCUL_JPD_2025.csv --max-rows 300

# Simulation fuite + confirmation capteurs (zone 6 par défaut)
python3 scripts/seed_pressure_demo.py --zone-id 6
```

---

## Structure du projet

```
HydroTrack/
├── backend/
│   ├── app/
│   │   ├── main.py              # API FastAPI
│   │   ├── ml.py                # Moteur IsolationForest
│   │   ├── wave_propagation.py  # Modèle physique (c, x, R)
│   │   ├── pressure_analysis.py # Confirmation capteurs
│   │   └── services.py          # Orchestration métier
│   ├── data/                    # SQLite (hydrotrack.db)
│   └── requirements.txt
├── frontend/
│   └── src/                     # React (pages, cartes, admin)
├── scripts/                     # Ingestion et jeux de démo
├── HydroTrack_modele_IA.ipynb   # Prototype ML
└── README.md
```

---

## Seuils opérationnels (rappel)

| Probabilité ML (compteur) | Niveau | Carte compteur |
|-------------------------|--------|----------------|
| &lt; 25 % | Normal | Vert |
| 25 – 49 % | Vigilance | Jaune |
| 50 – 74 % | Attention | Orange |
| ≥ 75 % | Critique | Rouge |

Suspicion capteurs : **≥ 45 %** — confirmation requise avant localisation affichée.

---

## Build production (frontend)

```bash
cd frontend
npm run build
npm run preview
```

---

## Auteurs

Projet réalisé dans le cadre de la formation ingénieur à l'**Université de Technologie de Troyes (UTT)**.

| Auteur | Formation |
|--------|-----------|
| **Housséni YABRE** | Étudiant ingénieur en Informatique et Systèmes d'Information — spécialité IA & Data Engineering |
| **Kossi Sylvanus AMEYIDA** | Étudiant ingénieur en Réseaux et Télécommunications |
| **Rich DEGBEVI** | Étudiant ingénieur en Génie Industriel |

---

## Licence

Projet académique / démonstration — usage interne EDF / HydroTrack.  
Contacter les auteurs pour toute réutilisation ou diffusion.

---

<p align="center">
  <sub>HydroTrack — Tracer l'essentiel, dessiner un monde plus vert.</sub>
</p>
