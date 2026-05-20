/**
 * Confirmations avant suppression — utilise par les services API (hydroApi, adminApi).
 * Tout nouvel endpoint DELETE doit passer par requestDelete / adminDelete (confirmation automatique).
 */

export function confirmDelete(message, { title = "Confirmation de suppression" } = {}) {
  const text = title ? `${title}\n\n${message}` : message;
  return window.confirm(text);
}

export function confirmAction(message, { title = "Confirmation" } = {}) {
  return confirmDelete(message, { title });
}

export function confirmPermanentDelete(entityLabel, idOrName) {
  return confirmDelete(
    `Voulez-vous supprimer definitivement ${entityLabel} « ${idOrName} » ?\n\nCette action est irreversible.`,
  );
}

export function confirmDeactivate(entityLabel, idOrName) {
  return confirmDelete(
    `Voulez-vous desactiver ${entityLabel} « ${idOrName} » ?\n\nIl ne sera plus visible sur les cartes et listes publiques.`,
    { title: "Confirmation de desactivation" },
  );
}

export function confirmClearSelection(what = "la position selectionnee") {
  return confirmDelete(`Voulez-vous effacer ${what} ?`, {
    title: "Confirmation",
  });
}

/** true si l'appel API a ete annule par l'utilisateur (refus de confirmation). */
export function wasDeleteCancelled(result) {
  return result === null;
}

/**
 * Infere libelle + identifiant depuis l'URL API (nouveaux types d'enregistrements futurs).
 * @typedef {{ entityLabel: string, idOrName: string, hard?: boolean }} DeleteConfirmOptions
 */

const PATH_DELETE_HINTS = [
  { match: /\/meter-readings\//i, entityLabel: "le releve", formatId: (id) => `#${id}` },
  { match: /\/admin\/meters\//i, entityLabel: "le compteur", formatId: (id) => id },
  { match: /\/admin\/zones\//i, entityLabel: "la zone", formatId: (id) => id },
  { match: /\/admin\/sensors\//i, entityLabel: "le capteur", formatId: (id) => id },
  { match: /\/admin\/segments\//i, entityLabel: "le troncon", formatId: (id) => id },
  { match: /\/admin\/alerts\//i, entityLabel: "l'alerte", formatId: (id) => `#${id}` },
  { match: /\/admin\/leaks\//i, entityLabel: "l'incident de fuite", formatId: (id) => `#${id}` },
  { match: /\/meters\//i, entityLabel: "le compteur", formatId: (id) => id },
  { match: /\/sensors\//i, entityLabel: "le capteur", formatId: (id) => id },
  { match: /\/zones\//i, entityLabel: "la zone", formatId: (id) => id },
  { match: /\/alerts\//i, entityLabel: "l'alerte", formatId: (id) => `#${id}` },
  { match: /\/leaks\//i, entityLabel: "l'incident de fuite", formatId: (id) => `#${id}` },
];

function lastPathSegment(path) {
  const clean = String(path || "").split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] || clean;
}

export function inferDeleteConfirm(path, queryHard = false) {
  const id = decodeURIComponent(lastPathSegment(path));
  for (const hint of PATH_DELETE_HINTS) {
    if (hint.match.test(path)) {
      return {
        entityLabel: hint.entityLabel,
        idOrName: hint.formatId(id),
        hard: queryHard,
      };
    }
  }
  return {
    entityLabel: "cet enregistrement",
    idOrName: id || path,
    hard: queryHard,
  };
}

/**
 * Demande confirmation avant DELETE. Retourne false si l'utilisateur annule.
 * @param {DeleteConfirmOptions} options
 */
export function requireDeleteConfirmation(options = {}) {
  const { entityLabel, idOrName, hard = false } = options;
  const label = entityLabel || "cet enregistrement";
  const name = idOrName != null && idOrName !== "" ? String(idOrName) : "—";
  return hard ? confirmPermanentDelete(label, name) : confirmDeactivate(label, name);
}

/**
 * Confirme une suppression a partir du chemin API (pour futurs enregistrements sans methode dediee).
 */
export function requireDeleteConfirmationForPath(path, overrides = {}) {
  const url = new URL(path, "http://local");
  const hard = url.searchParams.get("hard") === "true" || overrides.hard === true;
  const inferred = inferDeleteConfirm(path, hard);
  return requireDeleteConfirmation({ ...inferred, ...overrides, hard });
}
