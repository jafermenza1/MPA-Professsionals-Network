import { validateReferenceRows } from "./validation.js";

export class ReferencePortfolioError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReferencePortfolioError";
    this.code = code;
  }
}

function requireStatus(version, expected) {
  if (version.status !== expected) {
    throw new ReferencePortfolioError(
      "INVALID_STATE",
      "Version " + version.id + " must be " + expected + "; current state is " + version.status + "."
    );
  }
}

export class ReferencePortfolioService {
  constructor(repository, clock = () => new Date()) {
    this.repository = repository;
    this.clock = clock;
  }

  listDatasets() { return this.repository.listDatasets(); }

  getPublishedVersion(datasetKey) {
    return this.repository.getPublishedVersion(datasetKey);
  }

  createDraftVersion(datasetKey, actorId, reason = null) {
    const dataset = this.repository.getDataset(datasetKey);
    if (!dataset) throw new ReferencePortfolioError("NOT_FOUND", "Dataset '" + datasetKey + "' not found.");
    return this.repository.createDraftVersion({
      datasetId: dataset.id, datasetKey, actorId, reason, createdAt: this.clock()
    });
  }

  validateImport(request) {
    const result = validateReferenceRows(request.rows);
    this.repository.recordImportValidation(request, result, this.clock());
    return result;
  }

  previewDiff(baseVersion, importedRows) {
    const existing = new Map((baseVersion?.items ?? []).map((item) => [item.code, item]));
    const incoming = new Map(importedRows.map((item) => [item.code, item]));
    const changes = [];
    for (const row of importedRows) {
      const old = existing.get(row.code);
      if (!old) changes.push({ code: row.code, classification: "new" });
      else if (old.name !== row.name || old.type !== row.type)
        changes.push({ code: row.code, classification: "renamed" });
      else if ((old.parent_code ?? null) !== (row.parent_code ?? null))
        changes.push({ code: row.code, classification: "parent_changed" });
      else changes.push({ code: row.code, classification: "unchanged" });
    }
    for (const old of existing.values()) {
      if (!incoming.has(old.code)) changes.push({ code: old.code, classification: "deleted" });
    }
    return changes;
  }

  submitForReview(versionId, actorId) {
    const version = this.repository.getVersion(versionId);
    if (!version) throw new ReferencePortfolioError("NOT_FOUND", "Version not found.");
    requireStatus(version, "validated");
    return this.repository.transitionVersion(versionId, "submitted", actorId, this.clock());
  }

  approve(versionId, actorId) {
    const version = this.repository.getVersion(versionId);
    if (!version) throw new ReferencePortfolioError("NOT_FOUND", "Version not found.");
    requireStatus(version, "submitted");
    return this.repository.transitionVersion(versionId, "approved", actorId, this.clock());
  }

  publish(versionId, actorId, reason = "Publication") {
    const version = this.repository.getVersion(versionId);
    if (!version) throw new ReferencePortfolioError("NOT_FOUND", "Version not found.");
    requireStatus(version, "approved");
    return this.repository.publishVersion(versionId, actorId, reason, this.clock());
  }

  schedule(versionId, effectiveAt, actorId) {
    const version = this.repository.getVersion(versionId);
    if (!version) throw new ReferencePortfolioError("NOT_FOUND", "Version not found.");
    requireStatus(version, "approved");
    if (!(effectiveAt instanceof Date) || Number.isNaN(effectiveAt.getTime()))
      throw new ReferencePortfolioError("INVALID_DATE", "A valid effective date is required.");
    return this.repository.scheduleVersion(versionId, effectiveAt, actorId, this.clock());
  }

  archive(versionId, actorId, reason = "Archived") {
    const version = this.repository.getVersion(versionId);
    if (!version) throw new ReferencePortfolioError("NOT_FOUND", "Version not found.");
    if (version.status === "published")
      throw new ReferencePortfolioError("IMMUTABLE", "Published versions cannot be archived through this operation.");
    return this.repository.transitionVersion(versionId, "archived", actorId, this.clock(), reason);
  }
}

export class InMemoryReferencePortfolioRepository {
  constructor({ datasets = [], versions = [] } = {}) {
    this.datasets = structuredClone(datasets);
    this.versions = structuredClone(versions);
    this.importValidations = [];
    this.publications = [];
    this.nextVersion = this.versions.length + 1;
  }

  listDatasets() { return structuredClone(this.datasets); }
  getDataset(key) { return this.datasets.find((d) => d.datasetKey === key) ?? null; }
  getPublishedVersion(key) {
    const dataset = this.getDataset(key);
    return dataset ? structuredClone(this.versions.find((v) => v.datasetId === dataset.id && v.status === "published") ?? null) : null;
  }
  getVersion(id) { return this.versions.find((v) => v.id === id) ?? null; }

  createDraftVersion(input) {
    const version = {
      id: "version-" + this.nextVersion++, datasetId: input.datasetId, datasetKey: input.datasetKey,
      status: "draft", reason: input.reason, createdBy: input.actorId, createdAt: input.createdAt, items: []
    };
    this.versions.push(version);
    return structuredClone(version);
  }

  recordImportValidation(request, result, at) {
    this.importValidations.push({ request: structuredClone(request), result: structuredClone(result), at });
  }

  transitionVersion(id, status, actorId, at, reason = null) {
    const version = this.getVersion(id);
    version.status = status; version.lastActorId = actorId; version.lastTransitionAt = at;
    if (reason) version.reason = reason;
    return structuredClone(version);
  }

  publishVersion(id, actorId, reason, at) {
    const version = this.getVersion(id);
    const current = this.versions.find((v) => v.datasetId === version.datasetId && v.status === "published");
    if (current) throw new ReferencePortfolioError("PUBLISHED_EXISTS", "A dataset cannot have two published versions.");
    version.status = "published"; version.publishedAt = at; version.publishedBy = actorId; version.reason = reason;
    this.publications.push({ versionId: id, action: "publish", actorId, reason, at });
    return structuredClone(version);
  }

  scheduleVersion(id, effectiveAt, actorId, at) {
    const version = this.getVersion(id);
    version.status = "scheduled"; version.effectiveAt = effectiveAt;
    version.lastActorId = actorId; version.lastTransitionAt = at;
    this.publications.push({ versionId: id, action: "schedule", actorId, at, effectiveAt });
    return structuredClone(version);
  }
}
