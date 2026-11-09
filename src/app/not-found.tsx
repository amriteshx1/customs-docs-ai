import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">That shipment was not found.</h1>
      <Link href="/" className="mt-4 inline-block text-sm text-info hover:underline">
        Back to shipments
      </Link>
    </main>
  );
}
