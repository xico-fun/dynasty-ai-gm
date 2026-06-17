import { redirect } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import QuickAsk from "@/components/QuickAsk"
import { getSessionLeague } from "@/lib/session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Logged-in users who haven't onboarded a league yet have no active league;
  // send them to onboarding instead of rendering a dataless dashboard. (The
  // proxy already guarantees the user is authenticated before reaching here.)
  const league = await getSessionLeague()
  if (!league) redirect("/onboarding")

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto animate-fade-in">
        {children}
      </main>
      <QuickAsk />
    </div>
  )
}
