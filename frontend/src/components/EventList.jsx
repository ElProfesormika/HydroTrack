import {
  riskFromAlertSeverity,
  riskFromProbability,
  riskLabelWithProbability,
} from "../utils/riskThresholds";

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR");
}

function alertSeverityClass(severity) {
  return riskFromAlertSeverity(severity);
}

function anomalyRiskClass(p) {
  return riskFromProbability(p);
}

function anomalyRiskLabel(p) {
  return riskLabelWithProbability(riskFromProbability(p), p);
}

function alertSeverityLabel(severity) {
  const cls = alertSeverityClass(severity);
  const map = { normal: "Normal", caution: "Vigilance", warning: "Attention", critical: "Critique" };
  return map[cls] || severity || "Normal";
}

export function EventList({ title, items, mode }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <ul className="event-list">
        {items.length === 0 ? <li>Aucune donnee disponible.</li> : null}
        {items.map((item, idx) => (
          <li
            key={`${mode}-${idx}-${item.timestamp || "na"}`}
            className={
              mode === "anomalies"
                ? `event-item event-item--risk-${anomalyRiskClass(item.leak_probability)}`
                : `event-item event-item--risk-${alertSeverityClass(item.severity)}`
            }
          >
            {mode === "alerts" ? (
              <>
                <span className={`tag tag-severity ${alertSeverityClass(item.severity)}`}>
                  {alertSeverityLabel(item.severity)}
                </span>
                <strong> {item.source_id}</strong>
                <p>
                  {formatDate(item.timestamp)} - {item.message}
                </p>
              </>
            ) : (
              <>
                <span className={`tag tag-severity ${anomalyRiskClass(item.leak_probability)}`}>
                  {anomalyRiskLabel(item.leak_probability)}
                </span>
                <strong> {item.meter_id}</strong>
                <p>
                  {formatDate(item.timestamp)} - score {Number(item.score || 0).toFixed(2)} /
                  fuite {Math.round((item.leak_probability || 0) * 100)}%
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
