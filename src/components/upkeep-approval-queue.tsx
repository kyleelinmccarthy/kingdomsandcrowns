import { UpkeepTaskCard, type UpkeepCardData } from "@/components/upkeep-task-card";

export function UpkeepApprovalQueue({
  rows,
  today,
}: {
  rows: UpkeepCardData[];
  today: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="page-title text-xl">Awaiting your approval</h3>
      {rows.map((row) => (
        <UpkeepTaskCard
          key={row.assignment.id}
          data={row}
          isChildView={false}
          today={today}
        />
      ))}
    </section>
  );
}
