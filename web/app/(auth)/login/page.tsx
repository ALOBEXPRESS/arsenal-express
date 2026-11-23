"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ACCESS_ADMIN_EMAIL, ACCESS_REQUEST_URL } from "@/lib/system-access";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.');

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Entrar no SyncExpress</h1>
        <p className="text-muted-foreground">
          Acesso exclusivo para e-mails autorizados pelo administrador.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Senha
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setSenha(e.target.value)}
            required
            className="w-full px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-primary-fill text-primary-foreground font-semibold rounded-md hover:bg-primary-fill/90 disabled:opacity-50 transition font-medium"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <Link href={ACCESS_REQUEST_URL} className="block rounded-md border border-primary p-3 text-center font-semibold text-primary">Solicitar acesso ou consultar pedido</Link>
      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground">
        Já recebeu autorização?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Criar conta
        </Link>
      </div>
    </div>
  );
}
