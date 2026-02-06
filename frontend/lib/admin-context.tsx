'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

export type UserProfile = {
    id: string
    email?: string
    display_name?: string
    role: 'admin' | 'user'
    created_at?: string
    last_sign_in_at?: string
}

type AdminContextType = {
    selectedUserId: string | null
    selectedUser: UserProfile | null
    users: UserProfile[]
    setSelectedUserId: (id: string | null) => void
    isManagingOtherUser: boolean
    loading: boolean
    refreshUsers: () => Promise<void>
}

const AdminContext = createContext<AdminContextType | undefined>(undefined)

export function AdminProvider({ children }: { children: React.ReactNode }) {
    const { isAdmin, user: currentUser } = useAuth()
    const [users, setUsers] = useState<UserProfile[]>([])
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const fetchUsers = async () => {
        if (!isAdmin) return
        setLoading(true)
        try {
            const res = await fetch('/api/admin/users')
            if (res.ok) {
                const data = await res.json()
                setUsers(data)
            } else {
                const errorText = await res.text()
                console.error('Failed to fetch users:', res.status, errorText)
                try {
                    const errorJson = JSON.parse(errorText)
                    console.error('Error details:', errorJson)
                } catch (e) {
                    // ignore
                }
            }
        } catch (error) {
            console.error('Error fetching users:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (isAdmin) {
            fetchUsers()
        } else {
            setUsers([])
            setSelectedUserId(null)
        }
    }, [isAdmin])

    const selectedUser = selectedUserId
        ? users.find(u => u.id === selectedUserId) || null
        : null

    const isManagingOtherUser = !!selectedUserId && selectedUserId !== currentUser?.id

    return (
        <AdminContext.Provider value={{
            selectedUserId,
            selectedUser,
            users,
            setSelectedUserId,
            isManagingOtherUser,
            loading,
            refreshUsers: fetchUsers
        }}>
            {children}
        </AdminContext.Provider>
    )
}

export const useAdminContext = () => {
    const context = useContext(AdminContext)
    if (context === undefined) {
        throw new Error('useAdminContext must be used within an AdminProvider')
    }
    return context
}
