import * as React from "react";
import { ClipboardCheckIcon, MoonIcon, SunIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";

// Keep in sync with the inline theme script in DashboardLayout.astro.
export const THEME_STORAGE_KEY = "ccc-theme";

function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark" | null>(null);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const initial: "light" | "dark" =
      stored === "light" || stored === "dark"
        ? stored
        : prefersDark
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);

  React.useEffect(() => {
    if (theme === null) {
      return;
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = React.useCallback(() => {
    setTheme((current) =>
      current === "light" ? "dark" : current === "dark" ? "light" : current,
    );
  }, []);

  return { theme, toggleTheme };
}

type AppSidebarProps = {
  pathname: string;
  headerTitle?: string;
  children: React.ReactNode;
};

export function AppSidebar({
  pathname,
  headerTitle = "Dashboard",
  children,
}: AppSidebarProps) {
  const isTestsActive = pathname === "/tests" || pathname.startsWith("/tests/");
  const { theme, toggleTheme } = useTheme();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ClipboardCheckIcon className="size-4" />
              </div>
              <div
                data-sidebar="brand"
                className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden"
              >
                <span className="truncate text-sm font-semibold tracking-tight">
                  CCC Tester
                </span>
                <span className="truncate text-[0.65rem] text-sidebar-foreground/50">
                  Check runner
                </span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isTestsActive}
                    tooltip="Tests results"
                    render={<a href="/tests" />}
                  >
                    <ClipboardCheckIcon />
                    <span>Tests results</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center justify-between gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <span className="text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
                Theme
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
                title="Toggle dark mode"
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </Button>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm font-medium">{headerTitle}</span>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
