from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import admin_routes
from .models import Alert, MeterDataIn, MeterReadingIn, MeterReadingUpdate, PressureDataIn
from .services import InMemoryStore

app = FastAPI(title="HydroTrack API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)
store = InMemoryStore()
admin_routes.bind_admin_store(store)


async def _broadcast_registry_updated() -> None:
    await _broadcast({"type": "registry", "action": "updated"})


admin_routes.bind_registry_broadcast(_broadcast_registry_updated)
ws_clients: list[WebSocket] = []
app.include_router(admin_routes.router)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/meter-readings")
def list_meter_readings(limit: int = 10, meter_id: str | None = None) -> dict:
    items = store.list_meter_readings(limit=limit, meter_id=meter_id)
    return {"count": len(items), "items": items}


@app.get("/api/meter-readings/{reading_id}")
def get_meter_reading(reading_id: int) -> dict:
    item = store.get_meter_reading(reading_id)
    if not item:
        raise HTTPException(status_code=404, detail="Releve introuvable")
    return item


@app.post("/api/meter-readings")
async def create_meter_reading(payload: MeterReadingIn) -> dict:
    if payload.meter_id not in store.registry.meter_ids:
        raise HTTPException(status_code=400, detail=f"Compteur non autorise: {payload.meter_id}")
    try:
        result = store.create_meter_reading(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur ML/releve: {exc}") from exc
    await _broadcast({"type": "meter_reading", "action": "created", "reading": result["reading"]})
    return {"status": "created", **result}


@app.put("/api/meter-readings/{reading_id}")
async def update_meter_reading(reading_id: int, payload: MeterReadingUpdate) -> dict:
    try:
        result = store.update_meter_reading(reading_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404 if "introuvable" in str(exc) else 400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur ML/releve: {exc}") from exc
    await _broadcast({"type": "meter_reading", "action": "updated", "reading": result["reading"]})
    return {"status": "updated", **result}


@app.delete("/api/meter-readings/{reading_id}")
async def delete_meter_reading(reading_id: int) -> dict:
    try:
        result = store.delete_meter_reading(reading_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await _broadcast({"type": "meter_reading", "action": "deleted", "reading_id": reading_id})
    return {"status": "deleted", **result}


@app.post("/api/meters/data")
async def ingest_meter_data(payload: MeterDataIn) -> dict:
    if payload.meter_id not in store.registry.meter_ids:
        raise HTTPException(status_code=400, detail=f"Compteur non autorise: {payload.meter_id}")
    try:
        result = store.ingest_meter(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _broadcast(
        {
            "type": "meter_data",
            "timestamp": payload.timestamp.isoformat(),
            "meter_id": payload.meter_id,
            "result": result,
        }
    )
    return {"status": "accepted", "result": result}


@app.post("/api/sensors/pressure")
async def ingest_pressure_data(payload: PressureDataIn) -> dict:
    result = store.ingest_pressure(payload)
    await _broadcast(
        {
            "type": "pressure_data",
            "timestamp": payload.timestamp.isoformat(),
            "sensor_id": payload.sensor_id,
            "zone": payload.zone,
        }
    )
    return {"status": "accepted", "result": result}


@app.get("/api/anomalies")
def get_anomalies(limit: int = 50) -> dict:
    items = store.get_anomalies(limit=limit)
    return {"count": len(items), "items": items}


@app.get("/api/alerts")
def get_alerts(limit: int = 50) -> dict:
    items = store.get_alerts(limit=limit)
    return {"count": len(items), "items": items}


@app.get("/api/network/state")
def get_network_state() -> dict:
    state = store.get_network_state()
    return state.model_dump()


@app.get("/api/dashboard/overview")
def get_dashboard_overview() -> dict:
    return store.get_dashboard_overview()


@app.get("/api/dashboard/timeseries")
def get_dashboard_timeseries(bucket_minutes: int = 30, points: int = 24) -> dict:
    items = store.get_timeseries(bucket_minutes=bucket_minutes, points=points)
    return {"count": len(items), "items": items}


@app.get("/api/dashboard/meter-flow-series")
def get_meter_flow_series(bucket_minutes: int = 60, points: int = 24) -> dict:
    items = store.get_meter_flow_timeseries(bucket_minutes=bucket_minutes, points=points)
    return {"count": len(items), "items": items}


@app.get("/api/dashboard/meter-flow-per-meter")
def get_meter_flow_per_meter(bucket_minutes: int = 60, points: int = 72) -> dict:
    return store.get_meter_flow_per_meter(
        bucket_minutes=bucket_minutes,
        points=points,
        meter_order=store.registry.meter_ids,
    )


@app.get("/api/dashboard/meter-profile/{meter_id}")
def get_meter_profile(
    meter_id: str,
    bucket_minutes: int = 30,
    points: int = 48,
    recent_limit: int = 12,
) -> dict:
    return store.get_meter_profile(
        meter_id=meter_id,
        bucket_minutes=bucket_minutes,
        points=points,
        recent_limit=recent_limit,
    )


@app.get("/api/dashboard/pressure-series")
def get_pressure_series(bucket_minutes: int = 60, points: int = 24) -> dict:
    items = store.get_pressure_timeseries(bucket_minutes=bucket_minutes, points=points)
    return {"count": len(items), "items": items}


@app.get("/api/dashboard/alert-stats")
def get_alert_stats() -> dict:
    return store.get_alert_stats()


@app.get("/api/dashboard/sensors-catalog")
def get_sensors_catalog() -> dict:
    items = store.get_sensors_catalog()
    return {"count": len(items), "items": items}


@app.get("/api/dashboard/zone-sensors")
def get_zone_sensors_status() -> dict:
    items = store.get_zone_sensor_status()
    return {"count": len(items), "items": items}


@app.get("/api/dashboard/wave-physics")
def get_wave_physics_reference() -> dict:
    return store.get_wave_physics_reference()


@app.get("/api/network/topology")
def get_network_topology() -> dict:
    return store.get_network_topology()


@app.get("/api/leaks/localizations")
def get_leak_localizations(limit: int = 20, confirmed_only: bool = False) -> dict:
    items = store.get_leak_localizations(limit=limit, confirmed_only=confirmed_only)
    return {"count": len(items), "items": items}


@app.get("/api/map/zones")
def get_map_zones() -> dict:
    items = store.get_map_zones_enriched()
    return {"count": len(items), "items": items}


@app.get("/api/map/alerts")
def get_map_alerts(limit: int = 50) -> dict:
    items = store.get_map_leak_markers(limit=limit)
    return {"count": len(items), "items": items}


@app.get("/api/map/meters")
def get_map_meters() -> dict:
    items = store.get_map_meter_items()
    return {"count": len(items), "items": items}


@app.get("/api/map/sensors")
def get_map_sensors() -> dict:
    items = store.get_map_sensor_items()
    return {"count": len(items), "items": items}


@app.post("/api/alerts/test")
async def create_test_alert() -> dict:
    alert = Alert(
        timestamp=datetime.now(timezone.utc),
        severity="normal",
        category="anomaly",
        source_id="SYSTEM",
        message="Alerte de test HydroTrack",
    )
    store.add_alert(alert)
    await _broadcast({"type": "alert", "payload": alert.model_dump(mode="json")})
    return {"status": "created"}


@app.websocket("/ws/events")
async def ws_events(websocket: WebSocket) -> None:
    await websocket.accept()
    ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_clients.remove(websocket)


async def _broadcast(payload: dict) -> None:
    disconnected: list[WebSocket] = []
    for client in ws_clients:
        try:
            await client.send_json(payload)
        except RuntimeError:
            disconnected.append(client)
    for client in disconnected:
        if client in ws_clients:
            ws_clients.remove(client)
