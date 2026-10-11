import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryReferencePortfolioRepository,
  ReferencePortfolioError,
  ReferencePortfolioService
} from "../../src/reference-portfolio/service.js";

function setup() {
  const repo = new InMemoryReferencePortfolioRepository({
    datasets: [{ id: "d1", datasetKey: "occupation", name: "Occupation", domain: "occupation" }]
  });
  return { repo, service: new ReferencePortfolioService(repo, () => new Date("2026-10-08T00:00:00Z")) };
}

function approve(repo, service, id) {
  repo.transitionVersion(id, "validated", "system", new Date());
  service.submitForReview(id, "reviewer");
  service.approve(id, "approver");
}

test("enforces validated -> review -> approved -> published", () => {
  const { repo, service } = setup();
  const draft = service.createDraftVersion("occupation", "admin-1");
  assert.throws(() => service.approve(draft.id, "reviewer-1"), /must be submitted/);
  approve(repo, service, draft.id);
  const published = service.publish(draft.id, "publisher-1", "Initial publication");
  assert.equal(published.status, "published");
});

test("prevents a second published version", () => {
  const { repo, service } = setup();
  const first = service.createDraftVersion("occupation", "admin");
  approve(repo, service, first.id);
  service.publish(first.id, "publisher");
  const second = service.createDraftVersion("occupation", "admin");
  approve(repo, service, second.id);
  assert.throws(() => service.publish(second.id, "publisher"), (e) =>
    e instanceof ReferencePortfolioError && e.code === "PUBLISHED_EXISTS"
  );
});

test("keeps published version immutable through archive operation", () => {
  const { repo, service } = setup();
  const draft = service.createDraftVersion("occupation", "admin");
  approve(repo, service, draft.id);
  service.publish(draft.id, "publisher");
  assert.throws(() => service.archive(draft.id, "admin"), (e) => e.code === "IMMUTABLE");
});

test("records validation and publication audit data", () => {
  const { repo, service } = setup();
  service.validateImport({
    datasetKey: "occupation", format: "json", filename: "occupation.json",
    rows: [{ code: "1", name: "Root", type: "major" }]
  });
  assert.equal(repo.importValidations.length, 1);
  const draft = service.createDraftVersion("occupation", "admin");
  approve(repo, service, draft.id);
  service.publish(draft.id, "publisher", "Approved baseline");
  assert.equal(repo.publications[0].actorId, "publisher");
  assert.equal(repo.publications[0].reason, "Approved baseline");
});

test("diff marks new, renamed, parent change and deleted rows", () => {
  const { service } = setup();
  const diff = service.previewDiff(
    { items: [
      { code: "A", name: "Old", type: "node" },
      { code: "B", name: "Keep", type: "node", parent_code: "A" }
    ] },
    [
      { code: "A", name: "New", type: "node" },
      { code: "B", name: "Keep", type: "node", parent_code: null },
      { code: "C", name: "Added", type: "node" }
    ]
  );
  assert.deepEqual(diff, [
    { code: "A", classification: "renamed" },
    { code: "B", classification: "parent_changed" },
    { code: "C", classification: "new" }
  ]);
});
