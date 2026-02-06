'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useAdminContext } from '@/lib/admin-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, Activity } from 'lucide-react'
import GroupsTable, { Group } from '@/components/dashboard/GroupsTable'
import GroupForm from '@/components/dashboard/GroupForm'
import { Category } from '@/components/dashboard/CategoriesTable'
import { toast } from 'sonner'

export default function GroupsPage() {
    const [groups, setGroups] = useState<Group[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editingGroup, setEditingGroup] = useState<Group | null>(null)
    const { user, isAdmin, loading: authLoading, supabase } = useAuth()
    const { selectedUserId } = useAdminContext()
    const router = useRouter()

    useEffect(() => {
        // Redirection for non-admin removed to allow read-only access
    }, [authLoading, isAdmin, router])

    const fetchData = useCallback(async () => {
        if (!user || !supabase) {
            console.log('[GroupsPage] fetchData aborted: No user or supabase client')
            return
        }

        console.log(`[GroupsPage] fetchData started for user: ${user.id}`)
        setLoading(true)
        try {
            // 1. Pobierz grupy
            console.log('[GroupsPage] Fetching groups table...')

            // If admin has selected a user, filter by that user.
            // If regular user, RLS will automatically restrict to their own groups.
            let query = supabase
                .from('groups')
                .select('*')
                .order('created_at', { ascending: false })

            if (selectedUserId) {
                query = query.eq('user_id', selectedUserId)
            }

            const { data: groupsData, error: groupsError } = await query

            if (groupsError) throw groupsError
            console.log(`[GroupsPage] Groups fetched: ${groupsData?.length ?? 0}`)

            // 2. Pobierz kategorie (do wyświetlania w tabeli i selecta)
            console.log('[GroupsPage] Fetching categories table...')
            const { data: categoriesData, error: categoriesError } = await supabase
                .from('categories')
                .select('*')
                .order('name', { ascending: true })

            if (categoriesError) throw categoriesError
            console.log(`[GroupsPage] Categories fetched: ${categoriesData?.length ?? 0}`)

            setGroups(groupsData || [])
            setCategories(categoriesData || [])
        } catch (error) {
            console.error('[GroupsPage] Error fetching data:', error)
            throw error // Re-throw to be caught by retry logic
        } finally {
            console.log('[GroupsPage] fetchData finally block - setLoading(false)')
            setLoading(false)
        }
    }, [user?.id, supabase, selectedUserId])

    const fetchDataWithRetry = useCallback(async (retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
            try {
                await fetchData()
                return // Success
            } catch (error) {
                console.error(`[GroupsPage] Attempt ${i + 1} failed:`, error)
                if (i < retries - 1) {
                    console.log(`[GroupsPage] Retrying in ${delay}ms...`)
                    await new Promise(resolve => setTimeout(resolve, delay * (i + 1))) // Exponential backoff-ish
                } else {
                    console.error('[GroupsPage] All retries failed')
                    toast.error('Nie udało się pobrać danych po kilku próbach. Odśwież stronę.')
                }
            }
        }
    }, [fetchData])



    useEffect(() => {
        console.log(`[GroupsPage] useEffect triggered. User: ${!!user}, Admin: ${isAdmin}, SelectedUser: ${selectedUserId}`)
        if (user) {
            fetchDataWithRetry()
        }
    }, [user?.id, isAdmin, fetchDataWithRetry, selectedUserId])

    const handleEdit = (group: Group) => {
        if (!isAdmin) return
        setEditingGroup(group)
        setFormOpen(true)
    }

    const handleAddNew = () => {
        setEditingGroup(null)
        setFormOpen(true)
    }

    const handleFormSuccess = () => {
        fetchData()
        setFormOpen(false)
        setEditingGroup(null)
    }

    const handleFormOpenChange = (open: boolean) => {
        setFormOpen(open)
        if (!open) {
            setEditingGroup(null)
        }
    }

    if (authLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
                <div className="container mx-auto p-6">
                    <div className="flex items-center justify-center h-64">
                        <Activity className="w-8 h-8 animate-pulse" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                            Grupy Facebook
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            {isAdmin
                                ? "Zarządzaj monitorowanymi grupami, przypisuj kategorie i śledź statystyki"
                                : "Przeglądaj monitorowane grupy i ich status"
                            }
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-lg px-4 py-2">
                            <Users className="w-4 h-4 mr-2" />
                            {groups.length} grup
                        </Badge>
                        {isAdmin && (
                            <Button onClick={handleAddNew}>
                                <Plus className="w-4 h-4 mr-2" />
                                Nowa grupa
                            </Button>
                        )}
                    </div>
                </div>

                <GroupsTable
                    groups={groups}
                    categories={categories}
                    loading={loading}
                    onRefresh={() => fetchDataWithRetry()}
                    onEdit={handleEdit}
                    readOnly={!isAdmin}
                />

                {isAdmin && (
                    <GroupForm
                        open={formOpen}
                        onOpenChange={handleFormOpenChange}
                        group={editingGroup}
                        categories={categories}
                        onSuccess={handleFormSuccess}
                        targetUserId={selectedUserId || undefined}
                    />
                )}
            </div>
        </div>
    )
}
