import DashboardShell from "@/components/DashboardShell";
import { AdminProvider } from "@/lib/admin-context";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AdminProvider>
            <DashboardShell>
                {children}
            </DashboardShell>
        </AdminProvider>
    );
}
