'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useAdminContext, UserProfile } from '@/lib/admin-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import UsersTable from '@/components/admin/UsersTable'
import UserForm from '@/components/admin/UserForm'

export default function UsersPage() {
    const { user, isAdmin, loading: authLoading } = useAuth()
    const { users, refreshUsers, loading } = useAdminContext()
    const router = useRouter()

    const [formOpen, setFormOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null)

    useEffect(() => {
        if (!authLoading && !isAdmin) {
            router.push('/')
            toast.error('Brak uprawnień do zarządzania użytkownikami')
        }
    }, [authLoading, isAdmin, router])

    const handleEdit = (user: UserProfile) => {
        setEditingUser(user)
        setFormOpen(true)
    }

    const handleAddNew = () => {
        setEditingUser(null)
        setFormOpen(true)
    }

    const handleFormSuccess = () => {
        refreshUsers()
        setFormOpen(false)
        setEditingUser(null)
    }

    const handleFormOpenChange = (open: boolean) => {
        setFormOpen(open)
        if (!open) {
            setEditingUser(null)
        }
    }

    const handleDelete = async (userToDelete: UserProfile) => {
        if (!confirm(`Czy na pewno chcesz usunąć użytkownika ${userToDelete.email}?`)) {
            return
        }

        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userToDelete.id })
            })

            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || 'Błąd podczas usuwania')
            }

            toast.success('Użytkownik został usunięty')
            refreshUsers()
        } catch (error: unknown) {
            console.error('Error deleting user:', error)
            const err = error as { message?: string }
            toast.error(err.message || 'Wystąpił błąd')
        }
    }

    if (authLoading) {
        return <div className="p-8 text-center">Sprawdzanie uprawnień...</div>
    }

    if (!isAdmin) {
        return null
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            Użytkownicy
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            Zarządzaj dostępem i rolami użytkowników w systemie
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-lg px-4 py-2">
                            <UserCog className="w-4 h-4 mr-2" />
                            {users.length} użytkowników
                        </Badge>
                        <Button onClick={handleAddNew}>
                            <Plus className="w-4 h-4 mr-2" />
                            Nowy użytkownik
                        </Button>
                    </div>
                </div>

                <UsersTable
                    users={users}
                    loading={loading}
                    onRefresh={refreshUsers}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    currentUserEmail={user?.email}
                />

                <UserForm
                    open={formOpen}
                    onOpenChange={handleFormOpenChange}
                    user={editingUser}
                    onSuccess={handleFormSuccess}
                />
            </div>
        </div>
    )
}
