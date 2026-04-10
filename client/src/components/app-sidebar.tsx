import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { LayoutDashboard, FolderTree, Settings, FileSearch, Cog, PanelLeftClose } from "lucide-react";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Site Explorer", url: "/sites", icon: FolderTree },
  { title: "Extractions", url: "/extractions", icon: FileSearch },
  { title: "Tag Management", url: "/admin/tags", icon: Settings },
  { title: "Settings", url: "/admin/settings", icon: Cog },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-5 pb-6 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:pb-2">
        <div className="flex flex-col gap-3 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:items-center">
          <motion.img
            src="/pwc_dark_nobg.png"
            alt="PwC"
            className="h-10 w-auto object-contain self-start group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:self-center"
            data-testid="img-pwc-logo"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          />
          <motion.div
            className="group-data-[collapsible=icon]:hidden"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <h2 className="text-sm font-bold tracking-tight text-sidebar-foreground" data-testid="text-app-title">Lease Extractor</h2>
            <p className="text-[11px] text-sidebar-foreground/50 font-medium tracking-wide uppercase">Document Manager</p>
          </motion.div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {navItems.map((item, index) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.06, duration: 0.4 }}
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive}
                        className={`h-10 rounded-lg transition-all duration-200 relative overflow-hidden ${
                          isActive 
                            ? "bg-[#D04A02] text-white shadow-lg shadow-[#D04A02]/30 hover:bg-[#B8400A]" 
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        }`}
                      >
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                          <motion.div
                            className="inline-flex"
                            whileHover={{ rotate: [0, -10, 10, 0] }}
                            transition={{ duration: 0.4 }}
                          >
                            <item.icon className="h-4 w-4" />
                          </motion.div>
                          <span className="font-medium text-[13px]">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </motion.div>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <SidebarTrigger
          data-testid="button-sidebar-toggle"
          className="w-full h-9 flex items-center justify-center gap-2 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-xs"
        >
          <PanelLeftClose className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Collapse</span>
        </SidebarTrigger>
      </SidebarFooter>
    </Sidebar>
  );
}
