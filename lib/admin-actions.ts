"use server";

/**
 * Server actions and data-fetching helpers for the /admin panel.
 *
 * All exports are admin-only. Every action re-verifies the session and
 * confirms Role.ADMIN before touching the database.
 *
 * inviteUser  — add an email to the Invite table (+ send a notification email)
 * revokeUser  — delete a User row or a pending Invite row
 * getAdminData — return all users + pending invites for the admin UI
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/actions";

const BETA_USER_CAP = 50;

// ---------- Shared types ----------

export interface AdminUserView {
  type: "user";
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  joinedAt: Date;
}

export interface AdminInviteView {
  type: "invite";
  id: string;
  email: string;
  inviterEmail: string | null;
  createdAt: Date;
}

// ---------- Auth guard ----------

async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

// ---------- Actions ----------

const inviteSchema = z.object({
  email: z.string().email({ error: "Must be a valid email address." }),
});

/**
 * Add an email to the Invite table so that person can sign in.
 * Also sends a "you've been invited" notification via Resend.
 * Enforces the 50-user beta cap (active users + pending invites).
 */
export async function inviteUser(formData: FormData): Promise<ActionResult> {
  let adminId: string;
  try {
    adminId = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized." };
  }

  const parsed = inviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { email: parsed.error.issues[0]?.message ?? "Invalid email." },
    };
  }
  const email = parsed.data.email.toLowerCase();

  // Check beta cap.
  const [userCount, pendingCount] = await Promise.all([
    prisma.user.count(),
    prisma.invite.count({ where: { acceptedAt: null } }),
  ]);
  if (userCount + pendingCount >= BETA_USER_CAP) {
    return { ok: false, error: `Beta is limited to ${BETA_USER_CAP} users.` };
  }

  // Check the email isn't already a user or has a pending invite.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That email already has an account." };
  }
  const existingInvite = await prisma.invite.findUnique({ where: { email } });
  if (existingInvite && !existingInvite.acceptedAt) {
    return { ok: false, error: "That email already has a pending invite." };
  }

  // Create (or re-create) the invite row.
  await prisma.invite.upsert({
    where: { email },
    create: { email, invitedBy: adminId },
    update: { invitedBy: adminId, acceptedAt: null, createdAt: new Date() },
  });

  // Send notification email via Resend (same key Auth.js uses).
  // This is best-effort — a delivery failure doesn't roll back the invite.
  try {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.AUTH_RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.AUTH_EMAIL_FROM,
        to: [email],
        subject: "You've been invited to InventoryDex",
        html: `<p>You've been invited to <strong>InventoryDex</strong>, a Pokémon TCG inventory tool.</p>
               <p><a href="${appUrl}/sign-in">Click here to sign in</a> with this email address. No password needed — we'll send you a magic link.</p>`,
      }),
    });
  } catch (err) {
    // Log but don't fail the action — the invite row is already created.
    console.warn("[inviteUser] invite email send failed", err);
  }

  revalidatePath("/admin");
  return { ok: true };
}

const revokeSchema = z.object({
  userId: z.string().optional(),
  inviteId: z.string().optional(),
}).refine((d) => d.userId || d.inviteId, { error: "userId or inviteId required." });

/**
 * Delete a User row (and all their data) or a pending Invite row.
 * ADMIN users cannot be revoked.
 */
export async function revokeUser(formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized." };
  }

  const parsed = revokeSchema.safeParse({
    userId: formData.get("userId") ?? undefined,
    inviteId: formData.get("inviteId") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (parsed.data.userId) {
    const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!target) return { ok: false, error: "User not found." };
    if (target.role === "ADMIN") {
      return { ok: false, error: "Cannot revoke an admin account." };
    }
    await prisma.user.delete({ where: { id: parsed.data.userId } });
  } else if (parsed.data.inviteId) {
    const invite = await prisma.invite.findUnique({ where: { id: parsed.data.inviteId } });
    if (!invite) return { ok: false, error: "Invite not found." };
    await prisma.invite.delete({ where: { id: parsed.data.inviteId } });
  }

  revalidatePath("/admin");
  return { ok: true };
}

// ---------- Data helper (called from the admin server component) ----------

/**
 * Returns all users and all pending invites for the admin UI.
 * Called directly from the AdminPage server component — not a mutation action.
 */
export async function getAdminData(): Promise<{
  users: AdminUserView[];
  invites: AdminInviteView[];
  totalSlots: number;
  usedSlots: number;
}> {
  try {
    await requireAdmin();
  } catch {
    throw new Error("Unauthorized");
  }

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    }),
    prisma.invite.findMany({
      where: { acceptedAt: null },
      orderBy: { createdAt: "desc" },
      include: { inviter: { select: { email: true } } },
    }),
  ]);

  return {
    users: users.map((u) => ({
      type: "user" as const,
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      joinedAt: u.createdAt,
    })),
    invites: invites.map((inv) => ({
      type: "invite" as const,
      id: inv.id,
      email: inv.email,
      inviterEmail: inv.inviter.email,
      createdAt: inv.createdAt,
    })),
    totalSlots: BETA_USER_CAP,
    usedSlots: users.length + invites.length,
  };
}
