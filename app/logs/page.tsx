import type { Metadata } from "next";
import { LogDashboard } from "@/components/LogDashboard";

export const metadata: Metadata = {
  title: "Log dashboard",
  description: "Admin view of application logs",
};

export default function LogsPage() {
  return <LogDashboard />;
}
