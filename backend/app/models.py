from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MeterDataIn(BaseModel):
    timestamp: datetime
    meter_id: str = Field(min_length=1)
    volume: float = Field(ge=0)
    flow_rate: float = Field(ge=0)


class MeterReadingIn(BaseModel):
    """Releve manuel : index compteur (m3) a la date indiquee. Le debit est calcule cote serveur."""

    timestamp: datetime
    meter_id: str = Field(min_length=1)
    volume: float = Field(ge=0, description="Index compteur en m3 a la date du releve")
    notes: str = ""


class MeterReadingUpdate(BaseModel):
    timestamp: datetime | None = None
    meter_id: str | None = None
    volume: float | None = Field(default=None, ge=0)
    notes: str | None = None


class PressureDataIn(BaseModel):
    timestamp: datetime
    sensor_id: str = Field(min_length=1)
    zone: str = Field(min_length=1)
    pressure_signal: float
    frequency: float = Field(ge=0)
    intensity: float = Field(ge=0)


class Alert(BaseModel):
    timestamp: datetime
    severity: Literal["normal", "caution", "warning", "critical"]
    category: Literal["anomaly", "leak_suspected", "leak_confirmed"]
    source_id: str
    message: str


class Anomaly(BaseModel):
    timestamp: datetime
    meter_id: str
    score: float
    leak_probability: float


class NetworkState(BaseModel):
    timestamp: datetime
    active_alerts: int
    latest_anomalies: int
    ingested_meter_points: int
    ingested_pressure_points: int


class AdminLoginIn(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AdminMeterIn(BaseModel):
    meter_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    plan_x: float | None = None
    plan_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    active: bool = True
    notes: str = ""


class AdminMeterUpdate(BaseModel):
    name: str | None = None
    plan_x: float | None = None
    plan_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    active: bool | None = None
    notes: str | None = None


class AdminZoneIn(BaseModel):
    zone_id: int = Field(ge=1)
    name: str = Field(min_length=1)
    short_name: str = ""
    plan_x: float | None = None
    plan_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    active: bool = True
    notes: str = ""


class AdminZoneUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    plan_x: float | None = None
    plan_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    active: bool | None = None
    notes: str | None = None


class AdminSensorIn(BaseModel):
    sensor_id: str = Field(min_length=1)
    zone_id: int = Field(ge=1)
    segment_id: str | None = None
    role: str = "upstream"
    name: str = Field(min_length=1)
    plan_x: float | None = None
    plan_y: float | None = None
    active: bool = True
    notes: str = ""


class AdminSensorUpdate(BaseModel):
    zone_id: int | None = None
    segment_id: str | None = None
    role: str | None = None
    name: str | None = None
    plan_x: float | None = None
    plan_y: float | None = None
    active: bool | None = None
    notes: str | None = None


class AdminSegmentUpdate(BaseModel):
    upstream_meter: str | None = None
    downstream_meter: str | None = None
    length_m: float | None = Field(default=None, gt=0)
    active: bool | None = None
    notes: str | None = None


class AdminAlertUpdate(BaseModel):
    status: Literal["active", "acknowledged", "resolved", "dismissed"] | None = None
    admin_notes: str | None = None
    message: str | None = None
    severity: Literal["normal", "caution", "warning", "critical"] | None = None


class AdminLeakIncidentUpdate(BaseModel):
    status: Literal["open", "confirmed", "repaired", "false_positive", "dismissed"] | None = None
    admin_notes: str | None = None
    repaired_at: datetime | None = None
