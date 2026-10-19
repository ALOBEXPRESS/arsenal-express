import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { postzen } from "./postzen.server";

export type TikTokAccount = {
  id: string;
  postzen_account_id: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
};

export type TikTokPost = {
  id: string;
  account_id: string;
  caption: string;
  video_url: string;
  scheduled_at: string;
  status: string;
  postzen_post_id: string | null;
  error_message: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  created_at: string;
};

const PRIVACY = ["publicToEveryone", "mutualFollowFriends", "followerOfCreator", "selfOnly"] as const;

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tiktok_accounts")
      .select("id, postzen_account_id, username, display_name, avatar_url, status, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TikTokAccount[];
  });

export const syncAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const res = await postzen<{ accounts: any[] }>("/v1/accounts");
    const remote = (res.accounts ?? []).filter((a) => a.platform === "tiktok");
    const { data: existing } = await context.supabase
      .from("tiktok_accounts")
      .select("id, postzen_account_id");
    const byRemote = new Map((existing ?? []).map((e) => [e.postzen_account_id, e.id]));
    for (const a of remote) {
      const row = {
        user_id: context.userId,
        postzen_account_id: a._id,
        username: a.username ?? a.displayName ?? "tiktok",
        display_name: a.displayName ?? null,
        avatar_url: a.avatarUrl ?? null,
        status: a.status === "connected" && a.isActive !== false ? "active" : String(a.status ?? "inactive"),
      };
      const id = byRemote.get(a._id);
      const q = id
        ? context.supabase.from("tiktok_accounts").update(row).eq("id", id)
        : context.supabase.from("tiktok_accounts").insert(row);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
    return { synced: remote.length };
  });

export const getConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { redirectUrl: string }) => {
    if (!/^https?:\/\//.test(d.redirectUrl)) throw new Error("URL inválida");
    return d;
  })
  .handler(async ({ data }) => {
    const profiles = await postzen<{ profiles: any[] }>("/v1/profiles");
    const profile = profiles.profiles?.find((p) => p.isDefault) ?? profiles.profiles?.[0];
    if (!profile) throw new Error("Nenhum perfil PostZen encontrado");
    const qs = new URLSearchParams({ profileId: profile._id, redirectUrl: data.redirectUrl });
    const res = await postzen<{ authUrl: string }>(`/v1/connect/tiktok?${qs}`);
    return { authUrl: res.authUrl };
  });

export const removeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tiktok_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tiktok_posts")
      .select("*")
      .order("scheduled_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TikTokPost[];
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      accountId: string;
      caption: string;
      videoUrl: string;
      scheduledAt: string | null;
      privacyLevel: string;
    }) => {
      if (!d.accountId) throw new Error("Escolha uma conta");
      if (!/^https:\/\//.test(d.videoUrl)) throw new Error("Use um link https direto pro vídeo");
      if (d.caption.length > 2200) throw new Error("Legenda passa de 2.200 caracteres");
      if (!PRIVACY.includes(d.privacyLevel as any)) throw new Error("Privacidade inválida");
      if (d.scheduledAt) {
        const t = new Date(d.scheduledAt).getTime();
        if (isNaN(t) || t < Date.now() + 60_000)
          throw new Error("Agende pelo menos 1 minuto no futuro");
      }
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: acc, error: accErr } = await context.supabase
      .from("tiktok_accounts")
      .select("id, postzen_account_id")
      .eq("id", data.accountId)
      .single();
    if (accErr || !acc?.postzen_account_id) throw new Error("Conta não encontrada");

    const scheduledIso = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : null;
    const body: { [k: string]: unknown; scheduledFor?: string; publishNow?: boolean } = {
      content: data.caption,
      mediaItems: [{ url: data.videoUrl }],
      platforms: [
        {
          platform: "tiktok",
          accountId: acc.postzen_account_id,
          settings: { privacyLevel: data.privacyLevel, allowComments: true },
        },
      ],
    };
    if (scheduledIso) body.scheduledFor = scheduledIso;
    else body.publishNow = true;

    const res = await postzen<any>("/v1/posts", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-request-id": crypto.randomUUID() },
    });
    const post = res.post ?? res.existingPost ?? {};

    const { data: row, error } = await context.supabase
      .from("tiktok_posts")
      .insert({
        user_id: context.userId,
        account_id: acc.id,
        caption: data.caption,
        video_url: data.videoUrl,
        scheduled_at: scheduledIso ?? new Date().toISOString(),
        status: scheduledIso ? "scheduled" : "publishing",
        postzen_post_id: post._id ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as TikTokPost;
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("tiktok_posts")
      .select("postzen_post_id, status")
      .eq("id", data.id)
      .single();
    if (row?.postzen_post_id && row.status === "scheduled") {
      try {
        await postzen(`/v1/posts/${row.postzen_post_id}`, { method: "DELETE" });
      } catch (e) {
        console.error("[postzen] delete failed", e);
      }
    }
    const { error } = await context.supabase.from("tiktok_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapStatus(s: unknown): string | null {
  const v = String(s ?? "").toLowerCase();
  if (!v) return null;
  if (["published", "posted", "success", "completed"].includes(v)) return "published";
  if (["failed", "error"].includes(v)) return "failed";
  if (["scheduled", "pending", "queued"].includes(v)) return "scheduled";
  if (["publishing", "processing", "in_progress"].includes(v)) return "publishing";
  return null;
}

export const refreshPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("tiktok_posts")
      .select("id, postzen_post_id")
      .not("postzen_post_id", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(30);
    let updated = 0;
    for (const r of rows ?? []) {
      try {
        const res = await postzen<any>(`/v1/posts/${r.postzen_post_id}`);
        const p = res.post ?? res;
        const plat = (p.platforms ?? []).find((x: any) => x.platform === "tiktok") ?? {};
        const a = plat.analytics ?? p.analytics ?? {};
        const patch: {
          views: number; likes: number; comments: number; shares: number;
          status?: string; error_message?: string;
        } = {
          views: num(a.views ?? a.viewCount),
          likes: num(a.likes ?? a.likeCount),
          comments: num(a.comments ?? a.commentCount),
          shares: num(a.shares ?? a.shareCount),
        };
        const st = mapStatus(plat.status ?? p.status);
        if (st) patch.status = st;
        const err = plat.errorMessage ?? plat.error ?? p.errorMessage;
        if (err) patch.error_message = String(err);
        await context.supabase.from("tiktok_posts").update(patch).eq("id", r.id);
        updated++;
      } catch (e) {
        console.error("[postzen] refresh failed", r.postzen_post_id, e);
      }
    }
    return { updated };
  });
