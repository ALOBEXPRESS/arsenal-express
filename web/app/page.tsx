import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Arsenal Express
        </h1>
        <p className="text-xl text-muted-foreground">
          Transform scripts into professional short-form videos
        </p>
        <div className="flex gap-4 justify-center pt-8">
          <Link
            href="/login"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
          >
            Get Started
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
