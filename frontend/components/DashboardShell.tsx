'use client'

import { useState } from 'react'
import { Sidebar } from "@/components/Sidebar"
import { UserNav } from "@/components/UserNav"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardShell({
    children,
}: {
    children: React.ReactNode
}) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <div className="h-full relative">
            <div
                className={cn(
                    "hidden h-full md:flex md:flex-col md:fixed md:inset-y-0 z-[80] bg-gray-900 transition-all duration-300",
                    collapsed ? "md:w-20" : "md:w-72"
                )}
            >
                <Sidebar collapsed={collapsed} />
                <Button
                    onClick={() => setCollapsed(!collapsed)}
                    variant="ghost"
                    size="icon"
                    className="absolute -right-4 top-8 rounded-full bg-slate-800 text-white hover:bg-slate-700 h-8 w-8 shadow-md border border-slate-600 z-50"
                >
                    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
            </div>
            <main className={cn(
                "transition-all duration-300",
                collapsed ? "md:pl-20" : "md:pl-72"
            )}>
                <div className="flex items-center p-4 border-b">
                    <div className="ml-auto flex items-center space-x-4">
                        <UserNav />
                    </div>
                </div>
                <div className="h-full p-8 pt-6">
                    {children}
                </div>
            </main>
        </div>
    )
}
