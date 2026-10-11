import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grain flex min-h-screen flex-col items-center justify-center bg-surface-0 p-4">
      <Link href="/" className="mb-8" aria-label="SyncExpress — início">
        <Logo animated />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
