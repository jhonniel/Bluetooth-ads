import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requirePageUser } from "@/server/authz";
import { settingsService } from "@/server/services/settings-service";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, cookieStore] = await Promise.all([requirePageUser(), settingsService.getSystemSettings(), cookies()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar organizationName={settings.organizationName} />
      <SidebarInset>
        <SiteHeader user={{ name: user.name, email: user.email, role: user.role }} />
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
