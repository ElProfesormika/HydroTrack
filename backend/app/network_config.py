"""Compteurs reseau conformes a la specification HydroTrack (23 compteurs = 22 IDs)."""

from __future__ import annotations

# 23 compteurs physiques : AMPERE x2 + 20 uniques + JOLIOT CURIE x2
NETWORK_METER_IDS: list[str] = [
    "AMPERE_1",
    "AMPERE_2",
    "BCA1",
    "BCA2",
    "BECQUEREL",
    "CCAS",
    "CHARPAK",
    "EINSTEIN",
    "SIMULATEUR",
    "FARADAY",
    "FRANKLIN",
    "JOLIOT_CURIE_1",
    "JOLIOT_CURIE_2",
    "NEWTON",
    "PAP",
    "VOLTA",
    "AVOGADRO",
    "EDISON",
    "COULOMB1",
    "COULOMB2",
    "TREMPLIN",
    "SALLE_MUSCULATION",
]

NETWORK_METER_LABELS: dict[str, str] = {
    "AMPERE_1": "AMPERE 1",
    "AMPERE_2": "AMPERE 2",
    "BCA1": "BCA1",
    "BCA2": "BCA2",
    "BECQUEREL": "BECQUEREL",
    "CCAS": "CCAS",
    "CHARPAK": "CHARPAK",
    "EINSTEIN": "EINSTEIN",
    "SIMULATEUR": "SIMULATEUR",
    "FARADAY": "FARADAY",
    "FRANKLIN": "FRANKLIN",
    "JOLIOT_CURIE_1": "JOLIOT CURIE 1",
    "JOLIOT_CURIE_2": "JOLIOT CURIE 2",
    "NEWTON": "NEWTON",
    "PAP": "PAP",
    "VOLTA": "VOLTA",
    "AVOGADRO": "AVOGADRO",
    "EDISON": "EDISON",
    "COULOMB1": "COULOMB1",
    "COULOMB2": "COULOMB2",
    "TREMPLIN": "TREMPLIN",
    "SALLE_MUSCULATION": "SALLE MUSCULATION",
}

# Colonnes du fichier Donnee_compteur_SEP.csv -> compteurs directs (6 sources)
SEP_COLUMN_TO_METER: dict[str, str] = {
    "NOG 2SEP992QD": "AMPERE_1",
    "NOG 1SEP992QD": "AMPERE_2",
    "NOG 0SEP998QD": "BCA1",
    "NOG 0SEP999QD": "BCA2",
    "NOG 1SEP991QD": "BECQUEREL",
    "NOG 2SEP991QD": "CCAS",
}

SEP_METER_IDS: list[str] = list(SEP_COLUMN_TO_METER.values())

# Plafond pour les KPI (releves trop rapproches ou index aberrants)
MAX_FLOW_RATE_M3H_KPI: float = 2000.0

# Repartition par defaut pour les compteurs sans colonne CSV dediee
DEFAULT_DISTRIBUTION_METERS: list[str] = [
    mid for mid in NETWORK_METER_IDS if mid not in SEP_COLUMN_TO_METER.values()
]

DEFAULT_DISTRIBUTION_WEIGHTS: list[float] = [
    0.92 + (idx % 7) * 0.025 for idx in range(len(DEFAULT_DISTRIBUTION_METERS))
]
