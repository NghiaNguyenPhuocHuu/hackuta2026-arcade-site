/**
 * Sandbox-only internal seeder for checked-in arcade testers on
 * brazen-peccary-506. Keeps the live export so pushes do not delete it.
 *
 *   npx convex run arcade/devSeed:seedArcadeTesterInternal '{"email":"…","password":"…","points":150}'
 */
import { v } from "convex/values";
import { Scrypt } from "lucia";
import { internalMutation } from "../_generated/server";
import { applyAcceptedApplicationDecision } from "../admin/acceptanceDecision";
import { assignBadge } from "../admin/participantQr";
import { checkedInForParticipant } from "../admin/checkedInLookup";
import { adjustPoints } from "../admin/pointsLedger";
import { ensureEventConfig } from "../lib/eventConfig";
import { normalizeEmail } from "../lib/normalizeEmail";
import type { GenericId } from "convex/values";
import type { MutationCtx } from "../lib/dataModel";

const PECCARY_SLUG = "brazen-peccary-506";
const DEFAULT_POINTS = 100;

const applicationDefaults = {
  phone: "+18175550199",
  phoneCountry: "US",
  age: 20,
  school: "The University of Texas at Arlington",
  levelOfStudy: "Undergraduate University (3+ year)",
  major: "Computer Science",
  graduationYear: 2027,
  dietaryRestrictions: ["Vegetarian", "Halal"],
  otherDietaryRestrictions: "No shellfish",
  countryOfResidence: "United States",
  stateOfResidence: "Texas",
  internationalStudent: false,
  tshirtSize: "M",
  gender: "Prefer Not to Answer",
  raceEthnicity: ["Prefer Not to Answer"],
  experienceLevel: "Intermediate",
  hackathonsAttended: 2,
  builtOrWantToBuild: "Seeded arcade sandbox tester.",
  shortDeadlineLearning: "Arcade QA account.",
  hearAbout: "Friend",
  emergencyContactName: "Emergency Contact",
  emergencyContactRelationship: "Parent",
  emergencyContactPhone: "+18175550200",
  mlhCodeOfConductAgreed: true,
  mlhDataSharingConsent: true,
  foodAllergyWaiverAgreed: true,
  github: "https://github.com/hackuta",
} as const;

function assertPeccaryOnly() {
  if (!(process.env.CONVEX_CLOUD_URL ?? "").includes(PECCARY_SLUG)) {
    throw new Error(`Arcade tester seed is only allowed on ${PECCARY_SLUG}.`);
  }
}

async function ensureSeedAdmin(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("admins")
    .withIndex("by_email", (q) => q.eq("email", "dev-seed@hackuta.internal"))
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const adminId = await ctx.db.insert("admins", {
    email: "dev-seed@hackuta.internal",
    name: "Dev Seed Bot",
    role: "admin",
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  const admin = await ctx.db.get(adminId);
  if (!admin) throw new Error("Could not create seed admin.");
  return admin;
}

function testerBadge(email: string) {
  const local = email.split("@")[0]?.replace(/[^a-z0-9]+/gi, "-").toUpperCase() ?? "TESTER";
  return `PECCARY-${local}`.slice(0, 48);
}

export const seedArcadeTesterInternal = internalMutation({
  args: {
    email: v.string(),
    password: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    points: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertPeccaryOnly();
    await ensureEventConfig(ctx);
    const admin = await ensureSeedAdmin(ctx);
    const email = normalizeEmail(args.email);
    if (!email) throw new Error("A valid email is required.");

    const firstName = args.firstName?.trim() || "Arcade";
    const lastName = args.lastName?.trim() || "Tester";
    const displayName = `${firstName} ${lastName}`;
    const targetPoints = args.points ?? DEFAULT_POINTS;

    const now = Date.now();
    let existingAccount = false;
    let userId: GenericId<"users">;
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (existingUser) {
      existingAccount = true;
      userId = existingUser._id;
    } else {
      const secret = await new Scrypt().hash(args.password);
      userId = await ctx.db.insert("users", {
        email,
        name: displayName,
        emailVerificationTime: now,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: email,
        secret,
        emailVerified: email,
      });
    }

    let application = await ctx.db
      .query("applications")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", userId))
      .first();

    if (!application) {
      const applicationId = await ctx.db.insert("applications", {
        authUserId: userId,
        email,
        createdAt: now,
        applicantUpdatedAt: now,
        formSubmitted: true,
        submittedAt: now,
        firstName,
        lastName,
        ...applicationDefaults,
      });
      application = await ctx.db.get(applicationId);
    }

    if (!application) throw new Error("Application row could not be created.");

    let review = await ctx.db
      .query("applicationReviews")
      .withIndex("by_application", (q) => q.eq("applicationId", application._id))
      .unique();

    if (!review) {
      const reviewId = await ctx.db.insert("applicationReviews", {
        applicationId: application._id,
        status: "under_review",
        createdAt: now,
        updatedAt: now,
      });
      review = await ctx.db.get(reviewId);
    }

    if (!review) throw new Error("Review row could not be created.");

    let participant = await ctx.db
      .query("participants")
      .withIndex("by_application", (q) => q.eq("applicationId", application._id))
      .unique();

    if (review.status !== "accepted" || !participant) {
      await applyAcceptedApplicationDecision(ctx, { application, review, admin });
      participant = await ctx.db
        .query("participants")
        .withIndex("by_application", (q) => q.eq("applicationId", application._id))
        .unique();
    }

    if (!participant) throw new Error("Participant row could not be created.");

    await assignBadge(ctx, {
      participant,
      badge: testerBadge(email),
      actorAdminId: admin._id,
      now,
      checkIn: true,
    });

    const checkedIn = await checkedInForParticipant(ctx, participant._id);
    if (!checkedIn) throw new Error("Checked-in row could not be created.");

    const currentPoints = checkedIn.points ?? 0;
    const delta = targetPoints - currentPoints;
    if (delta !== 0) {
      await adjustPoints(ctx, {
        actorAdminId: admin._id,
        participantId: participant._id,
        delta,
        reason: "arcade sandbox seed",
      });
    }

    const profilePoints = targetPoints;

    return {
      email,
      userId,
      checkedInId: checkedIn._id,
      existingAccount,
      profilePoints,
    };
  },
});