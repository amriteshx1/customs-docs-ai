import { redirect } from "next/navigation";
import { fieldMeta } from "@/domain/fields";
import { getAccuracy } from "@/server/accuracy/metrics";
import { getOptionalSession } from "@/server/authz";

export const dynamic = "force-dynamic";

function percent(value: number | null) {
  if (value === null) return "No reviewed fields";
  return `${Math.round(value * 1000) / 10}%`;
}

function fieldLabel(fieldKey: string) {
  return fieldMeta(fieldKey.replace("lineItems.*", "lineItems.0")).label.replace(/^Line 1 /, "");
}

export default async function AccuracyPage() {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  if (user.role !== "DOCUMENTATION_MANAGER") {
    return (
      <div className="mx-auto max-w-lg px-6 py-10">
        <h1 className="font-serif text-3xl">Accuracy</h1>
        <p className="mt-3 text-sm text-muted">Only a documentation manager can view extraction accuracy.</p>
      </div>
    );
  }
  const accuracy = await getAccuracy();
  return (
    <div className="mx-auto max-w-[1100px] space-y-8 px-6 py-8">
      <div>
        <h1 className="font-serif text-3xl">Accuracy</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          A field counts only after a person confirms or corrects an AI value that was present. Missing, unreadable, and manually entered fields stay out of the figure. Unchanged confirmations count as correct.
        </p>
      </div>
      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="text-sm font-medium">Overall</h2>
        <p className="mt-2 font-serif text-4xl">{percent(accuracy.overall.accuracy)}</p>
        <p className="mt-1 text-sm text-muted">
          {accuracy.overall.correct} correct of {accuracy.overall.total} reviewed fields
        </p>
      </section>
      <AccuracyTable
        title="By field"
        empty="No reviewed fields yet."
        rows={accuracy.byField.map((row) => ({ label: fieldLabel(row.fieldKey), ...row }))}
      />
      <AccuracyTable
        title="By supplier"
        empty="No reviewed fields yet."
        rows={accuracy.bySupplier.map((row) => ({ label: row.supplierName, ...row }))}
      />
    </div>
  );
}

function AccuracyTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ label: string; correct: number; total: number; accuracy: number | null }>;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Correct</th>
                <th className="px-4 py-3 font-medium">Reviewed</th>
                <th className="px-4 py-3 font-medium">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3">{row.correct}</td>
                  <td className="px-4 py-3">{row.total}</td>
                  <td className="px-4 py-3">{percent(row.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
