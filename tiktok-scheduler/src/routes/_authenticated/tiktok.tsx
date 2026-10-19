import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { openTikTokConnection } from "@/lib/tiktok-connect";
import { toast } from "sonner";
import { CalendarClock, Eye, Heart, Link2, MessageCircle, Plus, RefreshCw, Share2, Trash2, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createPost,
  deletePost,
  getConnectUrl,
  listAccounts,
  listPosts,
  refreshPosts,
  removeAccount,
  syncAccounts,
  type TikTokAccount,
  type TikTokPost,
} from "@/lib/tiktok.functions";

export const Route = createFileRoute("/_authenticated/tiktok")({
  head: () => ({
    meta: [
      { title: "Agendador TikTok — Arsenal Express" },
      { name: "description", content: "Contas, postagens agendadas e números dos seus vídeos no TikTok." },
      { property: "og:title", content: "Agendador TikTok — Arsenal Express" },
      { property: "og:description", content: "Contas, postagens agendadas e números dos seus vídeos no TikTok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TikTokPage,
});

function useAccounts() {
  const fn = useServerFn(listAccounts);
  return useQuery(queryOptions({ queryKey: ["tiktok", "accounts"], queryFn: () => fn() }));
}
function usePosts() {
  const fn = useServerFn(listPosts);
  return useQuery(queryOptions({ queryKey: ["tiktok", "posts"], queryFn: () => fn() }));
}

function TikTokPage() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("posts");
  const handledReturn = useRef(false);
  const sync = useServerFn(syncAccounts);
  const qc = useQueryClient();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (handledReturn.current || url.searchParams.get("tiktok_connected") !== "1") return;
    handledReturn.current = true;
    setTab("accounts");
    url.searchParams.delete("tiktok_connected");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    void sync().then(async (result) => {
      await qc.invalidateQueries({ queryKey: ["tiktok", "accounts"] });
      if (result.synced) toast.success("Contas atualizadas após a autorização do TikTok");
      else toast.error("Nenhuma conta TikTok encontrada. Confere se a autorização foi concluída e tenta Sincronizar.");
    }).catch((error: Error) => toast.error(error.message));
  }, [sync, qc]);
  return (
    <div className="animate-rise-in">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> TikTok Scheduler
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">Fila de postagem</h1>
          <p className="mt-1 text-muted-foreground">Cada vídeo com hora marcada, direto na conta certa.</p>
        </div>
        <Button size="lg" variant="glow" onClick={() => setOpen(true)}>
          <Plus /> Agendar vídeo
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 bg-surface-1">
          <TabsTrigger value="accounts">Contas</TabsTrigger>
          <TabsTrigger value="posts">Postagens</TabsTrigger>
          <TabsTrigger value="analytics">Análises</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts"><AccountsTab /></TabsContent>
        <TabsContent value="posts"><PostsTab onNew={() => setOpen(true)} /></TabsContent>
        <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
      </Tabs>

      <NewPostDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Empty({ icon: Icon, title, text, action }: { icon: typeof Video; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="grain flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-surface-2 p-4"><Icon className="h-8 w-8 text-muted-foreground" /></div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="panel border-destructive/50 p-6 text-sm text-destructive">
      {(error as Error)?.message ?? "Algo deu errado"}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => <div key={i} className="panel h-28 animate-pulse" />)}
    </div>
  );
}

/* ---------------- Contas ---------------- */

function AccountsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useAccounts();
  const sync = useServerFn(syncAccounts);
  const connect = useServerFn(getConnectUrl);
  const remove = useServerFn(removeAccount);

  const syncM = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      toast.success(`${r.synced} conta(s) sincronizada(s)`);
      qc.invalidateQueries({ queryKey: ["tiktok", "accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const connectM = useMutation({
    mutationFn: () => openTikTokConnection(() => connect({
      data: { redirectUrl: `${window.location.origin}/tiktok?tiktok_connected=1` },
    })),
    onError: (e: Error) => toast.error(e.message),
  });
  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tiktok"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => syncM.mutate()} disabled={syncM.isPending}>
        <RefreshCw className={syncM.isPending ? "animate-spin" : ""} /> Sincronizar
      </Button>
      <Button onClick={() => connectM.mutate()} disabled={connectM.isPending}>
        <Link2 /> {connectM.isPending ? "Conectando..." : "Conectar conta"}
      </Button>
    </div>
  );

  if (isLoading) return <SkeletonGrid />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.length)
    return (
      <Empty
        icon={Users}
        title="Nenhuma conta ainda"
        text="Conecta um perfil do TikTok ou puxa as contas que já estão na PostZen."
        action={actions}
      />
    );

  return (
    <div>
      <div className="mb-4 flex justify-end">{actions}</div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.map((a) => (
          <AccountCard key={a.id} a={a} onRemove={() => removeM.mutate(a.id)} />
        ))}
      </div>
    </div>
  );
}

function AccountCard({ a, onRemove }: { a: TikTokAccount; onRemove: () => void }) {
  const active = a.status === "active";
  return (
    <div className="panel flex items-center gap-4 p-5">
      {a.avatar_url ? (
        <img src={a.avatar_url} alt="" className="h-12 w-12 rounded-full border border-border object-cover" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 font-display font-bold">
          {a.username.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-bold">{a.display_name ?? a.username}</p>
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-success" : "bg-destructive"}`} />
          {active ? "No ar" : a.status}
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remover conta">
        <Trash2 />
      </Button>
    </div>
  );
}

/* ---------------- Postagens ---------------- */

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Agendado", cls: "bg-express/15 text-express" },
  publishing: { label: "Publicando", cls: "bg-accent/15 text-accent" },
  published: { label: "Publicado", cls: "bg-success/15 text-success" },
  failed: { label: "Falhou", cls: "bg-destructive/15 text-destructive" },
};

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function PostsTab({ onNew }: { onNew: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = usePosts();
  const { data: accounts } = useAccounts();
  const del = useServerFn(deletePost);
  const refresh = useServerFn(refreshPosts);
  const accName = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a.display_name ?? a.username])),
    [accounts],
  );

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Postagem removida");
      qc.invalidateQueries({ queryKey: ["tiktok", "posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const refreshM = useMutation({
    mutationFn: () => refresh(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tiktok", "posts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <SkeletonGrid />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.length)
    return (
      <Empty
        icon={CalendarClock}
        title="Fila vazia"
        text="Nenhum vídeo agendado. Marca o primeiro horário e ele sai sozinho."
        action={<Button variant="glow" onClick={onNew}><Plus /> Agendar vídeo</Button>}
      />
    );

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => refreshM.mutate()} disabled={refreshM.isPending}>
          <RefreshCw className={refreshM.isPending ? "animate-spin" : ""} /> Atualizar status
        </Button>
      </div>
      <div className="panel divide-y divide-border">
        {data.map((p) => {
          const s = STATUS[p.status] ?? { label: p.status, cls: "bg-surface-3 text-muted-foreground" };
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{fmt(p.scheduled_at)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.caption || "Sem legenda"}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {accName.get(p.account_id) ?? "—"} · {p.video_url}
                </p>
                {p.error_message && <p className="mt-1 text-xs text-destructive">{p.error_message}</p>}
              </div>
              <span className={`rounded-full px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-wider ${s.cls}`}>
                {s.label}
              </span>
              <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => delM.mutate(p.id)}>
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewPostDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: accounts } = useAccounts();
  const create = useServerFn(createPost);
  const [accountId, setAccountId] = useState("");
  const [caption, setCaption] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [when, setWhen] = useState("");
  const [privacyLevel, setPrivacy] = useState("publicToEveryone");

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          accountId,
          caption,
          videoUrl,
          scheduledAt: when ? new Date(when).toISOString() : null,
          privacyLevel,
        },
      }),
    onSuccess: () => {
      toast.success(when ? "Vídeo agendado" : "Vídeo enviado pra publicação");
      qc.invalidateQueries({ queryKey: ["tiktok", "posts"] });
      onOpenChange(false);
      setCaption("");
      setVideoUrl("");
      setWhen("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Agendar vídeo</DialogTitle>
        </DialogHeader>
        {!accounts?.length ? (
          <p className="text-sm text-muted-foreground">
            Conecta ou sincroniza uma conta na aba <strong>Contas</strong> antes de agendar.
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Escolhe a conta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.display_name ?? a.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="video">Link direto do vídeo (.mp4)</Label>
              <Input id="video" required type="url" placeholder="https://cdn.../video.mp4" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="caption">Legenda</Label>
              <Textarea id="caption" rows={3} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} />
              <p className="text-right font-mono text-xs text-muted-foreground">{caption.length}/2200</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="when">Quando</Label>
                <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                <p className="text-xs text-muted-foreground">Vazio = publica agora</p>
              </div>
              <div className="space-y-1.5">
                <Label>Quem vê</Label>
                <Select value={privacyLevel} onValueChange={setPrivacy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publicToEveryone">Todo mundo</SelectItem>
                    <SelectItem value="mutualFollowFriends">Amigos</SelectItem>
                    <SelectItem value="followerOfCreator">Seguidores</SelectItem>
                    <SelectItem value="selfOnly">Só eu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" variant="glow" disabled={m.isPending || !accountId}>
                {m.isPending ? "Enviando..." : when ? "Agendar" : "Publicar agora"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Análises ---------------- */

function AnalyticsTab() {
  const { data, isLoading, error } = usePosts();
  if (isLoading) return <SkeletonGrid />;
  if (error) return <ErrorBox error={error} />;
  const posts = data ?? [];
  if (!posts.length)
    return <Empty icon={Eye} title="Sem números ainda" text="Os números aparecem assim que os primeiros vídeos forem ao ar." />;

  const sum = (k: keyof TikTokPost) => posts.reduce((n, p) => n + (Number(p[k]) || 0), 0);
  const count = (s: string) => posts.filter((p) => p.status === s).length;
  const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 5);
  const nf = new Intl.NumberFormat("pt-BR", { notation: "compact" });

  const stats = [
    { label: "Visualizações", value: sum("views"), icon: Eye, cls: "text-accent" },
    { label: "Curtidas", value: sum("likes"), icon: Heart, cls: "text-primary" },
    { label: "Comentários", value: sum("comments"), icon: MessageCircle, cls: "text-foreground" },
    { label: "Compartilhamentos", value: sum("shares"), icon: Share2, cls: "text-express" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="panel p-5">
            <p className="eyebrow flex items-center gap-2"><s.icon className={`h-3.5 w-3.5 ${s.cls}`} /> {s.label}</p>
            <p className="mt-3 font-display text-3xl font-extrabold">{nf.format(s.value)}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {(["scheduled", "publishing", "published", "failed"] as const).map((s) => (
          <div key={s} className="panel flex items-center justify-between p-4">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{STATUS[s]?.label}</span>
            <span className="font-display text-2xl font-bold">{count(s)}</span>
          </div>
        ))}
      </div>
      <div className="panel p-5">
        <p className="eyebrow flex items-center gap-2"><span className="tally" aria-hidden /> Mais vistos</p>
        <div className="mt-4 divide-y divide-border">
          {top.map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 py-3">
              <span className="w-6 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate">{p.caption || "Sem legenda"}</span>
              <span className="font-mono text-sm">{nf.format(p.views)} views</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Use "Atualizar status" na aba Postagens pra puxar os números mais recentes.</p>
      </div>
    </div>
  );
}
