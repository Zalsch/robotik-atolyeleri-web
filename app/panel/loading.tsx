import { DashboardSkeleton } from "@/components/dashboard";

export default function Loading() {
  return <main className="panel-main"><div className="dashboard-welcome"><h1>Çalışma alanınız açılıyor…</h1></div><DashboardSkeleton /></main>;
}
