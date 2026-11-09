export function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
