import { test, expect, request as playwrightRequest } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getPool } from "../src/platform/db.js";
import { register as registerMember } from "../src/membership/service.js";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;

async function registerActor(label) {
  const suffix = randomUUID();
  return registerMember({
    email: `gate4-ats-${label}-${suffix}@example.test`,
    password: "gate4-ats-password-12345",
    firstName: "Gate4",
    lastName: label + suffix.slice(0, 6)
  }, randomUUID());
}

async function activateMember(userId, label) {
  const db = getPool();
  const product = (await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
  expect(product).toBeTruthy();
  await db.query(
    "insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",
    [userId, product.id, `G4-ATS-${label}-${userId.slice(0, 8)}`]
  );
}

test("ATS interview feedback is assigned-interviewer-only and the candidate timeline persists", async () => {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  try {
    const adminLogin = await api.post("/api/v1/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
    });
    expect(adminLogin.status()).toBe(200);
    const adminToken = (await adminLogin.json()).data.token;
    const adminHeaders = { authorization: "Bearer " + adminToken };
    const adminMe = await api.get("/api/v1/me", { headers: adminHeaders });
    expect(adminMe.status()).toBe(200);
    const adminId = (await adminMe.json()).data.user_id;

    const reviewer = await registerActor("reviewer");
    await getPool().query(
      "insert into app_user_role(user_id,role_id,assigned_by) select $1,id,$2 from app_role where role_code='reviewer' on conflict do nothing",
      [reviewer.user.id, adminId]
    );
    const reviewerLogin = await api.post("/api/v1/auth/login", {
      data: { email: reviewer.user.email, password: "gate4-ats-password-12345" }
    });
    expect(reviewerLogin.status()).toBe(200);
    const reviewerHeaders = { authorization: "Bearer " + (await reviewerLogin.json()).data.token };

    const organizationName = "Gate 4 ATS Organization " + randomUUID();
    const organizationResponse = await api.post("/api/v1/organizations", {
      headers: adminHeaders,
      data: { legalName: organizationName, displayName: organizationName, organizationType: "company" }
    });
    expect(organizationResponse.status()).toBe(201);
    const organization = (await organizationResponse.json()).data;
    const verificationSubmission = await api.post("/api/v1/organizations/" + organization.id + "/submit-verification", {
      headers: adminHeaders
    });
    expect(verificationSubmission.status()).toBe(200);
    const verificationDecision = await api.post("/api/v1/review/organizations", {
      headers: reviewerHeaders,
      data: { organizationId: organization.id, decision: "verified", reason: "Independent Gate 4 ATS fixture review." }
    });
    expect(verificationDecision.status()).toBe(200);

    const interviewer = await registerActor("interviewer");
    const interviewerOrgMembership = await api.post("/api/v1/organizations/" + organization.id + "/users", {
      headers: adminHeaders,
      data: { userId: interviewer.user.id, roleCode: "read_only" }
    });
    expect(interviewerOrgMembership.status()).toBe(201);
    const candidate = await registerActor("candidate");
    await activateMember(candidate.user.id, "CANDIDATE");

    const title = "Gate 4 Interview Feedback Role Test " + randomUUID();
    const jobResponse = await api.post("/api/v1/jobs", {
      headers: adminHeaders,
      data: {
        organizationId: organization.id,
        title,
        description: "Scoped interview feedback and candidate timeline acceptance fixture.",
        postingScope: "public",
        visibility: "public"
      }
    });
    expect(jobResponse.status()).toBe(201);
    const job = (await jobResponse.json()).data;
    const published = await api.post("/api/v1/jobs/" + job.id + "/publish", { headers: adminHeaders });
    expect(published.status()).toBe(200);

    const team = await api.post("/api/v1/jobs/" + job.id + "/team", {
      headers: adminHeaders,
      data: { userId: interviewer.user.id, roleCode: "interviewer" }
    });
    expect(team.status()).toBe(201);

    const draft = await api.post("/api/v1/jobs/" + job.id + "/application-drafts", {
      headers: { authorization: "Bearer " + candidate.token },
      data: { coverLetter: "I would like to be considered for this opportunity." }
    });
    expect(draft.status()).toBe(201);
    const applicationId = (await draft.json()).data.id;
    const submitted = await api.post("/api/v1/job-applications/" + applicationId + "/submit", {
      headers: { authorization: "Bearer " + candidate.token },
      data: {}
    });
    expect(submitted.status()).toBe(200);

    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const interviewResponse = await api.post("/api/v1/job-applications/" + applicationId + "/interviews", {
      headers: adminHeaders,
      data: {
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        interviewerUserId: interviewer.user.id,
        timezone: "Africa/Addis_Ababa",
        mode: "online",
        agenda: "Structured interview for the published role."
      }
    });
    expect(interviewResponse.status()).toBe(201);
    const interview = (await interviewResponse.json()).data;

    const candidateFeedback = await api.post("/api/v1/job-interviews/" + interview.id + "/feedback", {
      headers: { authorization: "Bearer " + candidate.token },
      data: { ratings: { roleFit: 4 }, recommendation: "advance", comments: "Must be denied." }
    });
    expect(candidateFeedback.status(), "candidates cannot submit interviewer feedback").toBe(403);

    const outsiderFeedback = await api.post("/api/v1/job-interviews/" + interview.id + "/feedback", {
      headers: { authorization: "Bearer " + reviewerHeaders.authorization.replace("Bearer ", "") },
      data: { ratings: { roleFit: 4 }, recommendation: "advance", comments: "Not assigned to this interview." }
    });
    expect(outsiderFeedback.status(), "a platform reviewer who is not assigned as interviewer cannot rate this interview").toBe(403);

    const candidateResponse = await api.post("/api/v1/job-interviews/" + interview.id + "/response", {
      headers: { authorization: "Bearer " + candidate.token },
      data: { status: "accepted" }
    });
    expect(candidateResponse.status()).toBe(200);

    const feedbackResponse = await api.post("/api/v1/job-interviews/" + interview.id + "/feedback", {
      headers: { authorization: "Bearer " + interviewer.token },
      data: {
        ratings: { roleFit: 4, communication: 5 },
        recommendation: "advance",
        comments: "Evidence-based interview feedback."
      }
    });
    expect(feedbackResponse.status()).toBe(201);
    const feedback = (await feedbackResponse.json()).data;
    expect(feedback.recommendation).toBe("advance");

    const note = await api.post("/api/v1/job-applications/" + applicationId + "/notes", {
      headers: adminHeaders,
      data: { note: "Interview completed; hiring team review pending.", visibility: "team" }
    });
    expect(note.status()).toBe(201);
    const noteData = (await note.json()).data;
    const notes = await api.get("/api/v1/job-applications/" + applicationId + "/notes", {
      headers: { authorization: "Bearer " + interviewer.token }
    });
    expect(notes.status()).toBe(200);
    expect((await notes.json()).data.some(row => row.id === noteData.id),
      "the authorized interview team can read the persisted candidate timeline note").toBe(true);

    const outsiderNotes = await api.get("/api/v1/job-applications/" + applicationId + "/notes", {
      headers: reviewerHeaders
    });
    expect(outsiderNotes.status(), "a reviewer without job-team scope cannot read candidate timeline notes").toBe(403);

    const persistedFeedback = await getPool().query(
      "select recommendation,ratings,comments from job_interview_feedback where interview_id=$1 and interviewer_user_id=$2",
      [interview.id, interviewer.user.id]
    );
    expect(persistedFeedback.rowCount).toBe(1);
    expect(persistedFeedback.rows[0].recommendation).toBe("advance");
  } finally {
    await api.dispose();
  }
});
