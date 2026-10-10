import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const handleSignOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl font-bold">
              Arsenal Express
            </Link>
            <nav className="flex gap-6">
              <Link
                href="/dashboard"
                className="text-sm hover:text-primary transition"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/projects"
                className="text-sm hover:text-primary transition"
              >
                Projects
              </Link>
              <Link
                href="/dashboard/renders"
                className="text-sm hover:text-primary transition"
              >
                Renders
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user.email}
            </span>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="text-sm text-muted-foreground hover:text-foreground transition"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
