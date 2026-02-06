'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import {
    LayoutDashboard,
    Users,
    Bell,
    Bot,
    Hash,
    FolderOpen,
    UserCog
} from 'lucide-react'

interface SidebarProps {
    collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
    const pathname = usePathname()
    const { isAdmin, supabase, user } = useAuth()
    const [alertsCount, setAlertsCount] = useState(0)

    useEffect(() => {
        if (!supabase || !user) return

        const fetchCount = async () => {
            console.log('Fetching alerts count...')
            const { count, error } = await supabase
                .from('alerts')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'new')

            if (!error) {
                console.log('Alerts count fetched:', count)
                setAlertsCount(count || 0)
            } else {
                console.error('Error fetching alerts count:', error)
            }
        }

        fetchCount()

        // Realtime subscription
        const channel = supabase
            .channel('sidebar-alerts')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'alerts' },
                (payload) => {
                    console.log('Sidebar Realtime Event:', payload)
                    setTimeout(fetchCount, 500)
                }
            )
            .subscribe((status) => {
                console.log('Sidebar Subscription Status:', status)
            })

        // Custom event for immediate local updates
        const handleRefresh = () => {
            console.log('Received refresh-alerts event')
            fetchCount()
        }

        window.addEventListener('refresh-alerts', handleRefresh)

        return () => {
            supabase.removeChannel(channel)
            window.removeEventListener('refresh-alerts', handleRefresh)
        }
    }, [supabase, user])

    const routes = [
        {
            label: 'Dashboard',
            icon: LayoutDashboard,
            href: '/',
            active: pathname === '/',
            adminOnly: false
        },
        {
            label: 'Grupy',
            icon: Users,
            href: '/groups',
            active: pathname === '/groups',
            adminOnly: false
        },
        {
            label: 'Słowa kluczowe',
            icon: Hash,
            href: '/keywords',
            active: pathname === '/keywords',
            adminOnly: false
        },
        {
            label: 'Kategorie',
            icon: FolderOpen,
            href: '/categories',
            active: pathname === '/categories',
            adminOnly: true
        },
        {
            label: 'Alerty',
            icon: Bell,
            href: '/alerts',
            active: pathname === '/alerts',
            adminOnly: false,
            badge: alertsCount > 0 ? alertsCount : null
        },
        {
            label: 'Boty',
            icon: Bot,
            href: '/bots',
            active: pathname === '/bots',
            adminOnly: false
        },

        {
            label: 'Użytkownicy',
            icon: UserCog,
            href: '/admin/users',
            active: pathname === '/admin/users',
            adminOnly: true
        }
    ]

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white transition-all duration-300">
            <div className={cn("px-3 py-2", collapsed ? "px-2" : "px-3")}>
                <div className={cn("flex items-center mb-6 px-2", collapsed ? "justify-center" : "justify-start")}>
                    <h2 className={cn("text-lg font-semibold tracking-tight transition-all duration-300", collapsed ? "hidden" : "block")}>
                        FB Scraper
                    </h2>
                    {collapsed && <span className="font-bold text-xl">FB</span>}
                </div>

                <div className="space-y-1">
                    {routes.map((route) => {
                        if (route.adminOnly && !isAdmin) return null

                        return (
                            <Link
                                key={route.href}
                                href={route.href}
                                className={cn(
                                    "text-sm group flex p-3 w-full font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300 relative",
                                    route.active ? "text-white bg-white/10" : "text-zinc-400",
                                    collapsed ? "justify-center" : "justify-start"
                                )}
                                title={collapsed ? route.label : undefined}
                            >
                                <div className="flex items-center w-full">
                                    <route.icon className={cn("h-5 w-5", route.active ? "text-blue-500" : "text-zinc-400", collapsed ? "mr-0" : "mr-3")} />
                                    {!collapsed && (
                                        <div className="flex flex-1 items-center justify-between">
                                            <span>{route.label}</span>
                                            {route.badge && (
                                                <Badge variant="destructive" className="h-5 w-5 flex items-center justify-center p-0 rounded-full text-xs">
                                                    {route.badge}
                                                </Badge>
                                            )}
                                        </div>
                                    )}
                                    {collapsed && route.badge && (
                                        <Badge variant="destructive" className="absolute top-1 right-1 h-3 w-3 p-0 rounded-full border-2 border-slate-900 flex items-center justify-center" />
                                    )}
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
