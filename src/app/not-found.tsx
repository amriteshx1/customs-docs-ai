import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-serif text-3xl">That shipment was not found.</h1>
      <Link href="/" className="mt-4 inline-block text-sm text-accent underline">
        Back to shipments
      </Link>
    </main>
  );
}
