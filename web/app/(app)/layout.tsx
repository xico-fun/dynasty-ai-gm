import Sidebar from "@/components/Sidebar"
import QuickAsk from "@/components/QuickAsk"

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
