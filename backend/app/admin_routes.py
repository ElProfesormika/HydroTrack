from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from .admin_auth import ADMIN_KEY, verify_admin_credentials, verify_admin_key
from .models import (
    AdminAlertUpdate,
    AdminLoginIn,
    AdminLeakIncidentUpdate,
    AdminMeterIn,
    AdminMeterUpdate,
    AdminSensorIn,
    AdminSensorUpdate,
    AdminSegmentUpdate,
    AdminZoneIn,
    AdminZoneUpdate,
)
from .services import InMemoryStore

router = APIRouter(prefix="/api/admin", tags=["admin"])
_store_ref: list[InMemoryStore] = []
_registry_broadcast: Callable[[], Awaitable[Any]] | None = None


def bind_admin_store(store: InMemoryStore) -> None:
    _store_ref.clear()
    _store_ref.append(store)


def bind_registry_broadcast(callback: Callable[[], Awaitable[Any]]) -> None:
    global _registry_broadcast
    _registry_broadcast = callback


def _push_registry_broadcast(background_tasks: BackgroundTasks) -> None:
    if _registry_broadcast:
        background_tasks.add_task(_registry_broadcast)


def get_store() -> InMemoryStore:
    if not _store_ref:
        raise RuntimeError("Store admin non initialise")
    return _store_ref[0]


@router.post("/auth/login")
def admin_login(payload: AdminLoginIn) -> dict:
    if not verify_admin_credentials(payload.username, payload.password):
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect")
    return {"status": "ok", "token": ADMIN_KEY, "username": payload.username.strip()}


@router.get("/overview")
def admin_overview(_: str = Depends(verify_admin_key), store: InMemoryStore = Depends(get_store)) -> dict:
    return store.admin.overview()


@router.get("/audit")
def admin_audit(
    limit: int = 50,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    items = store.admin.audit_log(limit=limit)
    return {"count": len(items), "items": items}


@router.post("/registry/reload")
def admin_reload_registry(
    background_tasks: BackgroundTasks,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    store.admin.reload_registry()
    _push_registry_broadcast(background_tasks)
    return {"status": "ok", "meters": len(store.registry.meters)}


@router.post("/leaks/sync-from-localizations")
def admin_sync_leaks(_: str = Depends(verify_admin_key), store: InMemoryStore = Depends(get_store)) -> dict:
    created = store.admin.sync_leak_incidents_from_localizations()
    return {"status": "ok", "created": created}


# —— Compteurs ——
@router.get("/meters")
def admin_list_meters(
    include_inactive: bool = True,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    items = store.admin.list_meters(include_inactive=include_inactive)
    return {"count": len(items), "items": items}


@router.post("/meters")
def admin_create_meter(
    payload: AdminMeterIn,
    background_tasks: BackgroundTasks,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.create_meter(payload.model_dump())
        _push_registry_broadcast(background_tasks)
        return {"status": "created", "item": item}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/meters/{meter_id}")
def admin_update_meter(
    meter_id: str,
    payload: AdminMeterUpdate,
    background_tasks: BackgroundTasks,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.update_meter(meter_id, payload.model_dump(exclude_unset=True))
        _push_registry_broadcast(background_tasks)
        return {"status": "updated", "item": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/meters/{meter_id}")
def admin_delete_meter(
    meter_id: str,
    background_tasks: BackgroundTasks,
    hard: bool = False,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    result = store.admin.delete_meter(meter_id, hard=hard)
    _push_registry_broadcast(background_tasks)
    return result


# —— Zones ——
@router.get("/zones")
def admin_list_zones(
    include_inactive: bool = True,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    items = store.admin.list_zones(include_inactive=include_inactive)
    return {"count": len(items), "items": items}


@router.post("/zones")
def admin_create_zone(
    payload: AdminZoneIn,
    background_tasks: BackgroundTasks,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.create_zone(payload.model_dump())
        _push_registry_broadcast(background_tasks)
        return {"status": "created", "item": item}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/zones/{zone_id}")
def admin_update_zone(
    zone_id: int,
    payload: AdminZoneUpdate,
    background_tasks: BackgroundTasks,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.update_zone(zone_id, payload.model_dump(exclude_unset=True))
        _push_registry_broadcast(background_tasks)
        return {"status": "updated", "item": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/zones/{zone_id}")
def admin_delete_zone(
    zone_id: int,
    background_tasks: BackgroundTasks,
    hard: bool = False,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    result = store.admin.delete_zone(zone_id, hard=hard)
    _push_registry_broadcast(background_tasks)
    return result


# —— Capteurs ——
@router.get("/sensors")
def admin_list_sensors(
    include_inactive: bool = True,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    items = store.admin.list_sensors(include_inactive=include_inactive)
    return {"count": len(items), "items": items}


@router.post("/sensors")
def admin_create_sensor(
    payload: AdminSensorIn,
    background_tasks: BackgroundTasks,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.create_sensor(payload.model_dump())
        _push_registry_broadcast(background_tasks)
        return {"status": "created", "item": item}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/sensors/{sensor_id}")
def admin_update_sensor(
    sensor_id: str,
    payload: AdminSensorUpdate,
    background_tasks: BackgroundTasks,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.update_sensor(sensor_id, payload.model_dump(exclude_unset=True))
        _push_registry_broadcast(background_tasks)
        return {"status": "updated", "item": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/sensors/{sensor_id}")
def admin_delete_sensor(
    sensor_id: str,
    background_tasks: BackgroundTasks,
    hard: bool = False,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    result = store.admin.delete_sensor(sensor_id, hard=hard)
    _push_registry_broadcast(background_tasks)
    return result


# —— Troncons ——
@router.get("/segments")
def admin_list_segments(_: str = Depends(verify_admin_key), store: InMemoryStore = Depends(get_store)) -> dict:
    items = store.admin.list_segments()
    return {"count": len(items), "items": items}


@router.put("/segments/{segment_id}")
def admin_update_segment(
    segment_id: str,
    payload: AdminSegmentUpdate,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.update_segment(segment_id, payload.model_dump(exclude_unset=True))
        return {"status": "updated", "item": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# —— Alertes ——
@router.get("/alerts")
def admin_list_alerts(
    limit: int = 100,
    status: str | None = None,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    items = store.admin.list_alerts_admin(limit=limit, status=status)
    return {"count": len(items), "items": items}


@router.put("/alerts/{alert_id}")
def admin_update_alert(
    alert_id: int,
    payload: AdminAlertUpdate,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        item = store.admin.update_alert(alert_id, payload.model_dump(exclude_unset=True))
        return {"status": "updated", "item": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/alerts/{alert_id}")
def admin_delete_alert(
    alert_id: int,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    return store.admin.delete_alert(alert_id)


# —— Fuites ——
@router.get("/leaks")
def admin_list_leaks(
    limit: int = 50,
    status: str | None = None,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    items = store.admin.list_leak_incidents(limit=limit, status=status)
    return {"count": len(items), "items": items}


@router.put("/leaks/{incident_id}")
def admin_update_leak(
    incident_id: int,
    payload: AdminLeakIncidentUpdate,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    try:
        data = payload.model_dump(exclude_unset=True)
        if data.get("repaired_at"):
            data["repaired_at"] = data["repaired_at"].isoformat()
        item = store.admin.update_leak_incident(incident_id, data)
        return {"status": "updated", "item": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/leaks/{incident_id}")
def admin_delete_leak(
    incident_id: int,
    _: str = Depends(verify_admin_key),
    store: InMemoryStore = Depends(get_store),
) -> dict:
    return store.admin.delete_leak_incident(incident_id)
