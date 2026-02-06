'use client'

import React from 'react'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAdminContext } from '@/lib/admin-context'
import { useAuth } from '@/lib/auth-context'

export function UserSelector() {
    const { users, selectedUserId, setSelectedUserId, loading } = useAdminContext()
    const { user: currentUser } = useAuth()

    const handleValueChange = (value: string) => {
        if (value === 'all') {
            setSelectedUserId(null)
        } else {
            setSelectedUserId(value)
        }
    }

    // Determine current value for Select
    // if selectedUserId is null -> "all"
    // else selectedUserId
    const value = selectedUserId || 'all'

    return (
        <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-muted-foreground hidden md:inline-block">
                Kontekst:
            </span>
            <Select value={value} onValueChange={handleValueChange} disabled={loading}>
                <SelectTrigger className="w-[200px] h-8">
                    <SelectValue placeholder="Wybierz użytkownika" />
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectLabel>Widok danych</SelectLabel>
                        <SelectItem value="all">
                            <span className="font-bold">Wszyscy użytkownicy</span>
                        </SelectItem>
                        {currentUser && (
                            <SelectItem value={currentUser.id}>
                                <span>Moje dane (Admin)</span>
                            </SelectItem>
                        )}
                    </SelectGroup>
                    <SelectGroup>
                        <SelectLabel>Użytkownicy</SelectLabel>
                        {users
                            .filter(u => u.id !== currentUser?.id)
                            .map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                    <div className="flex items-center justify-between w-full gap-2">
                                        <span className="truncate max-w-[120px]">
                                            {u.display_name || u.email}
                                        </span>
                                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] h-4 px-1">
                                            {u.role}
                                        </Badge>
                                    </div>
                                </SelectItem>
                            ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    )
}
